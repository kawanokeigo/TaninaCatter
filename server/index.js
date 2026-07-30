const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());

// ==========================================
// キルしてはいけないシステムプロセス、キルしたくないやつとかの初期ブラックリスト
// ここは全部小文字でね
// ==========================================
const systemProcesses = [
  'svchost.exe', 'conhost.exe', 'runtimebroker.exe', 'smss.exe', 
  'csrss.exe', 'wininit.exe', 'services.exe', 'lsass.exe', 'lsm.exe', 
  'winlogon.exe', 'explorer.exe', 'spoolsv.exe', 'taskmgr.exe', 
  'dwm.exe', 'fontdrvhost.exe', 'sihost.exe', 'ctfmon.exe', 
  'dllhost.exe', 'wuauclt.exe', 'searchui.exe', 'shellexperiencehost.exe', 
  'audiodg.exe', 'system', 'registry', 'system idle process',
  // ▼ 追加：Windowsの裏で動くUI・入力系プロセス
  'applicationframehost.exe', 
  'textinputhost.exe', 
  'startmenuexperiencehost.exe', // スタートメニュー
  'searchapp.exe',               // 検索バー
  'searchhost.exe',              // 検索バー(Win11)
  'systemsettings.exe',          // 設定アプリの裏側
  'lockapp.exe',                  // ロック画面
  //なんかあったからこれも
  'rtkuwp.exe',
];

// 判定用の関数 (大文字小文字を無視して比較)
const isSystemProcess = (processName) => {
  if (!processName) return false;
  return systemProcesses.includes(processName.toLowerCase());
};


// ==========================================
// ① 起動中のプロセス一覧を取得するAPI
// ==========================================
app.get('/api/processes', (req, res) => {
  const psCommand = `powershell -NoProfile -Command "@(Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle -ne '' } | Select-Object Name, Id, MainWindowTitle) | ConvertTo-Json"`;

  exec(psCommand, (error, stdout) => {
    if (error) {
      console.error('プロセス取得エラー:', error);
      return res.status(500).json({ error: '取得失敗' });
    }

    try {
      if (!stdout.trim()) return res.json([]);

      const psOutput = JSON.parse(stdout);
      
      let processes = psOutput.map(p => ({
        name: p.Name + '.exe',
        pid: p.Id,
        windowTitle: p.MainWindowTitle
      }));

      // 🛡️ フィルター: システムプロセスを除外する
      processes = processes.filter(p => !isSystemProcess(p.name));

      res.json(processes);
    } catch (parseError) {
      console.error('データ解析エラー:', parseError);
      res.status(500).json({ error: 'データ解析失敗' });
    }
  });
});


// ==========================================
// ② プロセス名 (processName) を指定して丸ごとキルするAPI
// ==========================================
app.post('/api/kill', (req, res) => {
  const { processName } = req.body; 
  if (!processName) return res.status(400).json({ error: 'プロセス名がありません' });

  // 🛡️ フィルター: もしシステムプロセスをキルしようとしたら弾く！
  if (isSystemProcess(processName)) {
    console.warn(`[警告] システムプロセス (${processName}) の終了要求をブロックしました。`);
    return res.status(403).json({ error: 'システムプロセスは終了できません' });
  }

  exec(`taskkill /f /im ${processName}`, (error) => {
    if (error) {
      console.error(`[エラー] ${error.message}`);
      return res.status(500).json({ message: '終了失敗' });
    }
    console.log(`[成功] ${processName} を丸ごと終了`);
    res.json({ message: `${processName} を終了しました` });
  });
});

app.listen(3000, () => console.log('タスクキルAPI起動: http://localhost:3000'));