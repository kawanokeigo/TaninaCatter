let ws = null;
let heartbeatTimer = null;

function connect() {
  // すでに繋がっている、または接続中なら二重で作らない
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return;
  }

  ws = new WebSocket('ws://localhost:8088');

  ws.onopen = () => {
    console.log('🔗 Electronサーバーに接続しました！');
    sendTabs(); // 接続できたら今のタブ一覧を送る

    // ★ 追加：拡張機能がスリープするのを防ぐため、20秒おきに空のメッセージ（Ping）を送って起き続けさせる
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'PING' }));
      }
    }, 20000);
  };

  // Electron側から「このタブをキルして！」と命令が来た時の処理
  ws.onmessage = (event) => {
    const data = event.data;
    if (data.startsWith('KILL_TAB:')) {
      const tabId = parseInt(data.split(':')[1], 10);
      chrome.tabs.remove(tabId, () => {
        console.log(`💥 タブ(ID: ${tabId})をキルしました`);
      });
    }
  };

  ws.onclose = () => {
    console.log('❌ 切断されました。3秒後に再接続します...');
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    ws = null;
    setTimeout(connect, 3000);
  };

  ws.onerror = (err) => {
    console.error('WebSocketエラー:', err);
    if (ws) ws.close();
  };
}

// 今開いているタブの一覧をElectronに送る関数
function sendTabs() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    chrome.tabs.query({}, (tabs) => {
      const tabData = tabs.map(t => ({ id: t.id, title: t.title }));
      ws.send(JSON.stringify({ type: 'TABS_UPDATE', tabs: tabData }));
    });
  }
}

// ブラウザのタブ操作やウィンドウの切り替え時にタブ一覧を更新
chrome.tabs.onUpdated.addListener(sendTabs);
chrome.tabs.onRemoved.addListener(sendTabs);
chrome.tabs.onCreated.addListener(sendTabs);
chrome.tabs.onActivated.addListener(sendTabs); // ★ 追加：タブを切り替えたときにも確実に同期させる

// ★ 追加：Chromeの拡張機能自体がアクティブになったときにも再接続をチェック
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);

// 起動時に接続スタート
connect();