const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow () {
  // 브라우저 창을 생성합니다.
  const win = new BrowserWindow({
    width: 1000,
    height: 850,
    minWidth: 800,
    minHeight: 600,
    icon: path.join(__dirname, 'icon.png'), // (선택) 프로그램 아이콘 경로
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // 상단 메뉴바(File, Edit 등)를 숨겨서 진짜 깔끔한 프로그램처럼 보이게 합니다.
  win.setMenuBarVisibility(false);

  // 우리가 만든 HTML 파일을 로드합니다.
  win.loadFile('index.html');
}

// 일렉트론이 준비되면 창을 켭니다.
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 창이 모두 닫히면 프로세스도 완전히 종료합니다.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});