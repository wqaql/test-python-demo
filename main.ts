// main.ts
import { serve } from "https://deno.land/std@0.184.0/http/server.ts";

// API 端点配置
const ENDPOINTS = [
  {
    name: "Gemini Balance",
    url: "https://luckiness-me-gemini-balance.hf.space/health"
  },
  {
    name: "Demo API",
    url: "https://luckiness-test-df-demo.hf.space/health"
  }
];

// 请求超时设置（毫秒）
const TIMEOUT_MS = 5000;

// 默认自动刷新间隔（分钟）
const DEFAULT_REFRESH_INTERVAL = 5;

/**
 * 带超时的 fetch 函数
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

/**
 * 检查 API 健康状态
 */
async function checkHealth(endpoint: { name: string; url: string }) {
  try {
    console.log(`正在检查 ${endpoint.name} 健康状态...`);
    const start = Date.now();
    const response = await fetchWithTimeout(endpoint.url);
    const latency = Date.now() - start;
    
    let responseData;
    const contentType = response.headers.get("content-type") || "";
    
    if (contentType.includes("application/json")) {
      responseData = await response.json();
    } else {
      responseData = await response.text();
    }
    
    return {
      name: endpoint.name,
      url: endpoint.url,
      status: response.status,
      healthy: response.status >= 200 && response.status < 300,
      latency: `${latency}ms`,
      response: responseData,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    console.error(`检查 ${endpoint.name} 失败:`, error);
    return {
      name: endpoint.name,
      url: endpoint.url,
      status: 0,
      healthy: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// 保存后台健康检查的定时器ID
let healthCheckInterval: number | null = null;
let lastCheckResults: any[] = [];

// 后台健康检查功能
async function backgroundHealthCheck() {
  console.log("执行后台健康检查...");
  lastCheckResults = await Promise.all(ENDPOINTS.map(checkHealth));
  console.log(`健康检查完成，结果: ${JSON.stringify(lastCheckResults.map(r => r.healthy))}`);
}

/**
 * 主处理函数
 */
async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  
  // 添加CORS头
  const headers = new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  
  // 处理预检请求
  if (req.method === "OPTIONS") {
    return new Response(null, { headers });
  }
  
  // 根路径返回HTML界面
  if (url.pathname === "/") {
    return new Response(
      `<!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>API 健康监控</title>
        <style>
          body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
          h1 { color: #333; }
          .controls { margin-bottom: 20px; display: flex; align-items: center; }
          .card { border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
          .healthy { border-left: 5px solid #4caf50; }
          .unhealthy { border-left: 5px solid #f44336; }
          .status { font-size: 1.2em; font-weight: bold; }
          .latency { color: #666; }
          pre { background: #f5f5f5; padding: 10px; border-radius: 4px; overflow: auto; }
          button { padding: 8px 16px; background: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 10px; }
          button:hover { background: #3367d6; }
          button.active { background: #0d47a1; }
          label { margin-right: 10px; }
          input[type="number"] { width: 60px; padding: 5px; }
          .next-refresh { margin-left: 10px; font-style: italic; color: #666; }
        </style>
      </head>
      <body>
        <h1>API 健康监控</h1>
        <div class="controls">
          <button id="refresh">手动刷新</button>
          <label for="auto-refresh">
            <input type="checkbox" id="auto-refresh" checked> 自动刷新
          </label>
          <label for="refresh-interval">
            间隔:
            <input type="number" id="refresh-interval" min="1" value="${DEFAULT_REFRESH_INTERVAL}"> 分钟
          </label>
          <span id="next-refresh" class="next-refresh"></span>
        </div>
        <div id="results"></div>
        
        <script>
          const endpoints = ${JSON.stringify(ENDPOINTS)};
          let autoRefreshEnabled = true;
          let refreshInterval = ${DEFAULT_REFRESH_INTERVAL};
          let refreshTimeoutId;
          let nextRefreshTime;
          
          function updateNextRefreshDisplay() {
            if (!autoRefreshEnabled) {
              document.getElementById('next-refresh').textContent = '';
              return;
            }
            
            const now = new Date();
            const timeLeft = Math.round((nextRefreshTime - now) / 1000);
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;
            
            if (timeLeft > 0) {
              document.getElementById('next-refresh').textContent = 
                \`(下次刷新: \${minutes}分\${seconds}秒后)\`;
            }
          }
          
          function startRefreshTimer() {
            if (refreshTimeoutId) {
              clearTimeout(refreshTimeoutId);
            }
            
            if (autoRefreshEnabled) {
              const intervalMs = refreshInterval * 60 * 1000;
              nextRefreshTime = new Date(Date.now() + intervalMs);
              
              refreshTimeoutId = setTimeout(() => {
                checkHealth();
                startRefreshTimer();
              }, intervalMs);
              
              // 启动更新倒计时显示的计时器
              updateNextRefreshDisplay();
              setInterval(updateNextRefreshDisplay, 1000);
            }
          }
          
          async function checkHealth() {
            const results = document.getElementById('results');
            results.innerHTML = '<p>正在加载...</p>';
            
            try {
              const response = await fetch('/check');
              const data = await response.json();
              
              results.innerHTML = '';
              data.forEach(item => {
                const card = document.createElement('div');
                card.className = \`card \${item.healthy ? 'healthy' : 'unhealthy'}\`;
                
                let content = \`
                  <h2>\${item.name}</h2>
                  <p class="status">状态: \${item.healthy ? '✅ 健康' : '❌ 异常'}</p>
                  <p>URL: <a href="\${item.url}" target="_blank">\${item.url}</a></p>
                  <p>HTTP状态: \${item.status}</p>
                \`;
                
                if (item.latency) {
                  content += \`<p class="latency">延迟: \${item.latency}</p>\`;
                }
                
                if (item.error) {
                  content += \`<p>错误: \${item.error}</p>\`;
                } else if (item.response) {
                  content += \`<pre>\${JSON.stringify(item.response, null, 2)}</pre>\`;
                }
                
                content += \`<p>检查时间: \${new Date(item.timestamp).toLocaleString()}</p>\`;
                
                card.innerHTML = content;
                results.appendChild(card);
              });
            } catch (error) {
              results.innerHTML = \`<p>获取健康状态失败: \${error.message}</p>\`;
            }
          }
          
          // 设置事件监听
          document.getElementById('refresh').addEventListener('click', () => {
            checkHealth();
          });
          
          document.getElementById('auto-refresh').addEventListener('change', (e) => {
            autoRefreshEnabled = e.target.checked;
            if (autoRefreshEnabled) {
              startRefreshTimer();
            } else {
              if (refreshTimeoutId) {
                clearTimeout(refreshTimeoutId);
              }
              document.getElementById('next-refresh').textContent = '';
            }
          });
          
          document.getElementById('refresh-interval').addEventListener('change', (e) => {
            const value = parseInt(e.target.value);
            if (value > 0) {
              refreshInterval = value;
              if (autoRefreshEnabled) {
                startRefreshTimer();
              }
            }
          });
          
          // 页面加载时自动检查和启动定时器
          checkHealth();
          startRefreshTimer();
        </script>
      </body>
      </html>`,
      {
        headers: new Headers({
          ...Object.fromEntries(headers),
          "Content-Type": "text/html; charset=utf-8"
        })
      }
    );
  }
  
  // 健康检查API端点
  if (url.pathname === "/check") {
    const results = await Promise.all(ENDPOINTS.map(checkHealth));
    
    // 更新后台保存的结果
    lastCheckResults = results;
    
    return new Response(JSON.stringify(results, null, 2), {
      headers: new Headers({
        ...Object.fromEntries(headers),
        "Content-Type": "application/json"
      })
    });
  }
  
  // 获取最后保存的结果
  if (url.pathname === "/last-check") {
    return new Response(JSON.stringify(lastCheckResults, null, 2), {
      headers: new Headers({
        ...Object.fromEntries(headers),
        "Content-Type": "application/json"
      })
    });
  }
  
  // 检查单个服务的API端点
  const match = url.pathname.match(/^\/check\/(\d+)$/);
  if (match) {
    const index = parseInt(match[1]);
    if (index >= 0 && index < ENDPOINTS.length) {
      const result = await checkHealth(ENDPOINTS[index]);
      
      return new Response(JSON.stringify(result, null, 2), {
        headers: new Headers({
          ...Object.fromEntries(headers),
          "Content-Type": "application/json"
        })
      });
    }
  }
  
  // 404 Not Found
  return new Response("Not Found", {
    status: 404,
    headers: new Headers({
      ...Object.fromEntries(headers),
      "Content-Type": "text/plain"
    })
  });
}

// 启动服务
console.log("服务启动在 http://localhost:8000");
serve(handler);

// 每15分钟执行一次后台健康检查（不依赖前端访问）
console.log("设置后台健康检查定时器...");
if (healthCheckInterval === null) {
  // 先立即执行一次检查
  backgroundHealthCheck();
  
  // 然后设置定时检查 (15分钟 = 900000毫秒)
  healthCheckInterval = setInterval(backgroundHealthCheck, 900000);
}
