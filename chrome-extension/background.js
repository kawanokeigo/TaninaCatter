let ws = null;

// Electronの裏側（ポート8080）に接続しにいく
function connect() {
  ws = new WebSocket('ws://localhost:8088');

  ws.onopen = () => {
    console.log('🔗 Electronサーバーに接続しました！');
    sendTabs(); // 接続できたら今のタブ一覧を送る
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
    setTimeout(connect, 3000);
  };

  ws.onerror = () => {
    ws.close();
  };
}

// 今開いているタブの一覧をElectronに送る関数
function sendTabs() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    chrome.tabs.query({}, (tabs) => {
      // 必要な情報（タブのIDとタイトル）だけを抽出
      const tabData = tabs.map(t => ({ id: t.id, title: t.title }));
      ws.send(JSON.stringify({ type: 'TABS_UPDATE', tabs: tabData }));
    });
  }
}

// ブラウザのタブが開いたり、閉じたり、更新されたりしたら自動で再送信
chrome.tabs.onUpdated.addListener(sendTabs);
chrome.tabs.onRemoved.addListener(sendTabs);
chrome.tabs.onCreated.addListener(sendTabs);

// 起動時に接続スタート
connect();