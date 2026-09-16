using System.Diagnostics;
using System.Net;
using System.Net.NetworkInformation;
using System.Text;
using System.Timers;
using Timer = System.Timers.Timer;

namespace OMIManager;

public partial class Form1 : Form
{
    private readonly string _projectRoot;
    private readonly string _manageScript;
    private readonly int _backendPort = 8000;
    private readonly int _frontendPort = 3000;

    private Button btnStartAll, btnStopAll, btnRestartAll;
    private Button btnStartBackend, btnStopBackend, btnStartFrontend, btnStopFrontend;
    private Button btnClearLog, btnRefresh, btnCopyLinks;
    private Label lblBackendStatus, lblFrontendStatus;
    private Label lblBackendDetail, lblFrontendDetail;
    private Label lblNetworkInfo;
    private RichTextBox txtLog;
    private Timer _statusTimer;
    private NotifyIcon _trayIcon;
    private ContextMenuStrip _trayMenu;

    private bool _backendRunning, _frontendRunning;
    private bool _isOperating;
    private int _backendPid, _frontendPid;
    private DateTime _backendStartTime, _frontendStartTime;
    private string _networkIps = "";

    private static readonly Color Green = Color.FromArgb(76, 175, 80);
    private static readonly Color Red = Color.FromArgb(244, 67, 54);
    private static readonly Color Orange = Color.FromArgb(255, 152, 0);
    private static readonly Color Blue = Color.FromArgb(33, 150, 243);
    private static readonly Color DarkBg = Color.FromArgb(45, 45, 48);
    private static readonly Color PanelBg = Color.FromArgb(37, 37, 38);
    private static readonly Color TextPrimary = Color.FromArgb(240, 240, 240);
    private static readonly Color TextSecondary = Color.FromArgb(180, 180, 180);

    public Form1()
    {
        _projectRoot = AppContext.BaseDirectory;
        for (int i = 0; i < 6; i++)
        {
            if (File.Exists(Path.Combine(_projectRoot, "manage.ps1"))) break;
            var parent = Directory.GetParent(_projectRoot);
            if (parent == null) break;
            _projectRoot = parent.FullName;
        }
        _manageScript = Path.Combine(_projectRoot, "manage.ps1");

        InitializeForm();
        BuildUI();
        SetupTray();
        StartTimer();

        RefreshStatus();
        AppendLog("管理面板已启动");
    }

    // ==================== INIT ====================
    private void InitializeForm()
    {
        Text = "OMI 服务管理面板";
        Size = new Size(700, 695);
        StartPosition = FormStartPosition.CenterScreen;
        FormBorderStyle = FormBorderStyle.FixedSingle;
        MaximizeBox = false;
        MinimizeBox = true;
        BackColor = DarkBg;
        ForeColor = TextPrimary;
        try { Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
        Resize += (s, e) => { if (WindowState == FormWindowState.Minimized) Hide(); };
        FormClosing += (s, e) => { _statusTimer?.Stop(); _trayIcon.Visible = false; };
    }

    // ==================== BUILD UI ====================
    private void BuildUI()
    {
        var mainPanel = new TableLayoutPanel
        {
            Dock = DockStyle.Fill, Padding = new Padding(14), RowCount = 4, ColumnCount = 1
        };
        mainPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 125));
        mainPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 130));
        mainPanel.RowStyles.Add(new RowStyle(SizeType.Absolute, 115));
        mainPanel.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        Controls.Add(mainPanel);

        mainPanel.Controls.Add(BuildStatusPanel(), 0, 0);
        mainPanel.Controls.Add(BuildControlPanel(), 0, 1);
        mainPanel.Controls.Add(BuildLinkPanel(), 0, 2);
        mainPanel.Controls.Add(BuildLogPanel(), 0, 3);

        var statusBar = new StatusStrip { Dock = DockStyle.Bottom, BackColor = PanelBg, ForeColor = TextSecondary };
        statusBar.Items.Add(new ToolStripStatusLabel(" 就绪 | ") { ForeColor = TextSecondary });
        statusBar.Items.Add(new ToolStripStatusLabel("前端: http://localhost:3000 | ") { ForeColor = TextSecondary });
        statusBar.Items.Add(new ToolStripStatusLabel("API: http://localhost:8000/docs") { ForeColor = TextSecondary });
        Controls.Add(statusBar);
    }

    // ==================== STATUS PANEL ====================
    private GroupBox BuildStatusPanel()
    {
        var panel = CreateGroupBox("服务状态");
        var layout = new TableLayoutPanel { Dock = DockStyle.Fill, RowCount = 2, ColumnCount = 1, Padding = new Padding(8) };
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 50));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 50));
        panel.Controls.Add(layout);
        layout.Controls.Add(BuildServiceRow("后端", _backendPort, out lblBackendStatus, out lblBackendDetail), 0, 0);
        layout.Controls.Add(BuildServiceRow("前端", _frontendPort, out lblFrontendStatus, out lblFrontendDetail), 0, 1);
        return panel;
    }

    private FlowLayoutPanel BuildServiceRow(string name, int port, out Label indicator, out Label detail)
    {
        var row = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill, FlowDirection = FlowDirection.LeftToRight,
            Padding = new Padding(0, 6, 0, 0), WrapContents = false
        };
        indicator = new Label
        {
            Text = "\u25CF", Font = new Font("Segoe UI", 18, FontStyle.Bold),
            ForeColor = Color.Gray, Size = new Size(30, 30), TextAlign = ContentAlignment.MiddleCenter
        };
        detail = new Label
        {
            Text = $"{name}服务  端口:{port}  未运行",
            Font = new Font("Segoe UI", 10.5f), ForeColor = TextSecondary,
            Size = new Size(600, 30), TextAlign = ContentAlignment.MiddleLeft
        };
        row.Controls.Add(indicator);
        row.Controls.Add(detail);
        return row;
    }

    // ==================== CONTROL PANEL ====================
    private GroupBox BuildControlPanel()
    {
        var panel = CreateGroupBox("操作控制");
        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill, RowCount = 2, ColumnCount = 5, Padding = new Padding(6, 2, 6, 2)
        };
        for (int i = 0; i < 5; i++) layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 20));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 50));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 50));
        panel.Controls.Add(layout);

        // Row 0: Global actions
        btnStartAll    = CreateButton("\u25B6  一键启动", Green);
        btnStopAll     = CreateButton("\u25A0  停止全部", Red);
        btnRestartAll  = CreateButton("\u21BB  重启全部", Orange);
        btnRefresh     = CreateButton("\u27F3  刷新状态", Color.FromArgb(120, 120, 130));
        btnCopyLinks   = CreateButton("\u2398  复制链接", Color.FromArgb(80, 130, 180));

        btnStartAll.Click   += (s, e) => _ = ExecuteAction("start");
        btnStopAll.Click    += (s, e) => _ = ExecuteAction("stop");
        btnRestartAll.Click += (s, e) => _ = ExecuteAction("restart");
        btnRefresh.Click    += (s, e) => { RefreshStatus(); DetectNetworkIps(); AppendLog("状态已刷新"); };
        btnCopyLinks.Click  += (s, e) => CopyLinksToClipboard();

        layout.Controls.Add(btnStartAll, 0, 0);
        layout.Controls.Add(btnStopAll, 1, 0);
        layout.Controls.Add(btnRestartAll, 2, 0);
        layout.Controls.Add(btnRefresh, 3, 0);
        layout.Controls.Add(btnCopyLinks, 4, 0);

        // Row 1: Individual service controls
        btnStartBackend    = CreateButton("启动后端", Blue);
        btnStopBackend     = CreateButton("停止后端", Color.FromArgb(180, 80, 80));
        btnStartFrontend   = CreateButton("启动前端", Blue);
        btnStopFrontend    = CreateButton("停止前端", Color.FromArgb(180, 80, 80));

        btnStartBackend.Click  += (s, e) => _ = StartSingleService("backend");
        btnStopBackend.Click   += (s, e) => _ = StopSingleService("backend");
        btnStartFrontend.Click += (s, e) => _ = StartSingleService("frontend");
        btnStopFrontend.Click  += (s, e) => _ = StopSingleService("frontend");

        layout.Controls.Add(btnStartBackend, 0, 1);
        layout.Controls.Add(btnStopBackend, 1, 1);
        layout.Controls.Add(btnStartFrontend, 2, 1);
        layout.Controls.Add(btnStopFrontend, 3, 1);
        layout.Controls.Add(new Label(), 4, 1);
        return panel;
    }

    private Button CreateButton(string text, Color bgColor)
    {
        var btn = new Button
        {
            Text = text, Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
            FlatStyle = FlatStyle.Flat, BackColor = bgColor,
            ForeColor = Color.White, Margin = new Padding(2),
            Cursor = Cursors.Hand, TextAlign = ContentAlignment.MiddleCenter
        };
        btn.FlatAppearance.BorderSize = 0;
        btn.FlatAppearance.MouseOverBackColor = ControlPaint.Light(bgColor, 0.25f);
        btn.FlatAppearance.MouseDownBackColor = ControlPaint.Dark(bgColor, 0.15f);
        return btn;
    }

    // ==================== LINK PANEL ====================
    private GroupBox BuildLinkPanel()
    {
        var panel = CreateGroupBox("访问链接");
        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill, RowCount = 3, ColumnCount = 3, Padding = new Padding(8, 2, 8, 2)
        };
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 90));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent, 100));
        layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute, 60));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 33));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 33));
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 34));
        panel.Controls.Add(layout);

        // Row 0: Frontend
        layout.Controls.Add(new Label
        {
            Text = "前端页面", Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 9, FontStyle.Bold), ForeColor = TextPrimary, TextAlign = ContentAlignment.MiddleLeft
        }, 0, 0);
        var linkFE = new LinkLabel
        {
            Text = "http://localhost:3000", Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 9.5f), LinkColor = Color.FromArgb(100, 200, 255),
            ActiveLinkColor = Color.Cyan, TextAlign = ContentAlignment.MiddleLeft
        };
        linkFE.Click += (s, e) => OpenUrl("http://localhost:3000");
        layout.Controls.Add(linkFE, 1, 0);
        layout.Controls.Add(CreateCopyButton("http://localhost:3000"), 2, 0);

        // Row 1: API Docs
        layout.Controls.Add(new Label
        {
            Text = "API 文档", Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 9, FontStyle.Bold), ForeColor = TextPrimary, TextAlign = ContentAlignment.MiddleLeft
        }, 0, 1);
        var linkAPI = new LinkLabel
        {
            Text = "http://localhost:8000/docs", Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 9.5f), LinkColor = Color.FromArgb(100, 200, 255),
            ActiveLinkColor = Color.Cyan, TextAlign = ContentAlignment.MiddleLeft
        };
        linkAPI.Click += (s, e) => OpenUrl("http://localhost:8000/docs");
        layout.Controls.Add(linkAPI, 1, 1);
        layout.Controls.Add(CreateCopyButton("http://localhost:8000/docs"), 2, 1);

        // Row 2: Network + Login
        lblNetworkInfo = new Label
        {
            Text = "网络: 检测中...  |  登录: admin / admin123",
            Dock = DockStyle.Fill, Font = new Font("Segoe UI", 8.5f),
            ForeColor = TextSecondary, TextAlign = ContentAlignment.MiddleLeft
        };
        layout.SetColumnSpan(lblNetworkInfo, 3);
        layout.Controls.Add(lblNetworkInfo, 0, 2);

        DetectNetworkIps();
        return panel;
    }

    private Button CreateCopyButton(string url)
    {
        var btn = new Button
        {
            Text = "复制", Dock = DockStyle.Fill, Font = new Font("Segoe UI", 8),
            FlatStyle = FlatStyle.Flat, BackColor = Color.FromArgb(70, 70, 75),
            ForeColor = TextSecondary, Margin = new Padding(2), Cursor = Cursors.Hand
        };
        btn.FlatAppearance.BorderSize = 0;
        btn.FlatAppearance.MouseOverBackColor = Color.FromArgb(90, 90, 100);
        btn.Click += (s, e) => { Clipboard.SetText(url); AppendLog("已复制: " + url); };
        return btn;
    }

    // ==================== LOG PANEL ====================
    private GroupBox BuildLogPanel()
    {
        var panel = CreateGroupBox("操作日志");
        var layout = new TableLayoutPanel
        {
            Dock = DockStyle.Fill, RowCount = 2, ColumnCount = 1, Padding = new Padding(8)
        };
        layout.RowStyles.Add(new RowStyle(SizeType.Percent, 100));
        layout.RowStyles.Add(new RowStyle(SizeType.Absolute, 30));
        panel.Controls.Add(layout);

        txtLog = new RichTextBox
        {
            Dock = DockStyle.Fill, ReadOnly = true,
            BackColor = Color.FromArgb(30, 30, 30), ForeColor = Color.FromArgb(200, 200, 200),
            Font = new Font("Consolas", 9), BorderStyle = BorderStyle.None
        };
        layout.Controls.Add(txtLog, 0, 0);

        var bottomRow = new FlowLayoutPanel
        {
            Dock = DockStyle.Fill, FlowDirection = FlowDirection.RightToLeft,
            Padding = new Padding(0, 4, 0, 0)
        };
        btnClearLog = new Button
        {
            Text = "清空日志", Size = new Size(80, 26),
            FlatStyle = FlatStyle.Flat, BackColor = Color.FromArgb(70, 70, 75),
            ForeColor = TextSecondary, Font = new Font("Segoe UI", 8.5f), Cursor = Cursors.Hand
        };
        btnClearLog.FlatAppearance.BorderSize = 0;
        btnClearLog.FlatAppearance.MouseOverBackColor = Color.FromArgb(90, 90, 100);
        btnClearLog.Click += (s, e) => txtLog.Clear();
        bottomRow.Controls.Add(btnClearLog);
        layout.Controls.Add(bottomRow, 0, 1);
        return panel;
    }

    // ==================== TRAY ====================
    private void SetupTray()
    {
        _trayMenu = new ContextMenuStrip();
        _trayMenu.Items.Add("显示面板", null, (s, e) => { Show(); WindowState = FormWindowState.Normal; });
        _trayMenu.Items.Add(new ToolStripSeparator());
        _trayMenu.Items.Add("一键启动", null, (s, e) => _ = ExecuteAction("start"));
        _trayMenu.Items.Add("停止全部", null, (s, e) => _ = ExecuteAction("stop"));
        _trayMenu.Items.Add("重启全部", null, (s, e) => _ = ExecuteAction("restart"));
        _trayMenu.Items.Add(new ToolStripSeparator());
        _trayMenu.Items.Add("复制链接", null, (s, e) => CopyLinksToClipboard());
        _trayMenu.Items.Add(new ToolStripSeparator());
        _trayMenu.Items.Add("退出", null, (s, e) => { _trayIcon.Visible = false; Application.Exit(); });
        _trayIcon = new NotifyIcon { Text = "OMI 服务管理", ContextMenuStrip = _trayMenu, Visible = true };
        try { _trayIcon.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }
    }

    // ==================== TIMER ====================
    private void StartTimer()
    {
        _statusTimer = new Timer(3000);
        _statusTimer.Elapsed += (s, e) => BeginInvoke(() => RefreshStatus());
        _statusTimer.Start();
    }

    // ==================== STATUS ====================
    private async Task RefreshStatusAsync()
    {
        bool prevBackend = _backendRunning;
        var (beRunning, bp) = await IsPortInUseAsync(_backendPort);
        _backendRunning = beRunning; _backendPid = bp;
        if (_backendRunning && !prevBackend) _backendStartTime = DateTime.Now;

        bool prevFrontend = _frontendRunning;
        var (feRunning, fp) = await IsPortInUseAsync(_frontendPort);
        _frontendRunning = feRunning; _frontendPid = fp;
        if (_frontendRunning && !prevFrontend) _frontendStartTime = DateTime.Now;

        UpdateServiceLabel(lblBackendStatus, lblBackendDetail, "后端服务", _backendPort, _backendRunning, _backendPid, _backendStartTime);
        UpdateServiceLabel(lblFrontendStatus, lblFrontendDetail, "前端服务", _frontendPort, _frontendRunning, _frontendPid, _frontendStartTime);
        UpdateTrayText();
    }

    private void RefreshStatus()
    {
        // 同步版本：不做异步包装，保持兼容性
        // 但内部改为 fire-and-forget 异步以避免阻塞UI
        _ = RefreshStatusAsync();
    }

    private void UpdateServiceLabel(Label indicator, Label detail, string name, int port, bool running, int pid, DateTime startTime)
    {
        if (running)
        {
            indicator.ForeColor = Green;
            string memStr; TimeSpan uptime;
            try
            {
                var proc = Process.GetProcessById(pid);
                memStr = $"{(proc.WorkingSet64 / 1024.0 / 1024.0):F1}MB";
                uptime = DateTime.Now - proc.StartTime;
            }
            catch { memStr = "N/A"; uptime = DateTime.Now - startTime; }
            string u = uptime.TotalHours >= 1 ? $"{(int)uptime.TotalHours}h{uptime.Minutes}m" : $"{uptime.Minutes}m{uptime.Seconds}s";
            detail.Text = $"{name}  端口:{port}  运行中  PID:{pid}  内存:{memStr}  运行:{u}";
            detail.ForeColor = TextPrimary;
        }
        else
        {
            indicator.ForeColor = Red;
            detail.Text = $"{name}  端口:{port}  未运行";
            detail.ForeColor = TextSecondary;
        }
    }

    private void DetectNetworkIps()
    {
        try
        {
            var ips = new List<string>();
            foreach (var iface in NetworkInterface.GetAllNetworkInterfaces())
            {
                if (iface.OperationalStatus != OperationalStatus.Up) continue;
                foreach (var addr in iface.GetIPProperties().UnicastAddresses)
                    if (addr.Address.AddressFamily == System.Net.Sockets.AddressFamily.InterNetwork && !IPAddress.IsLoopback(addr.Address))
                        ips.Add(addr.Address.ToString());
            }
            _networkIps = string.Join(", ", ips.Take(3));
            lblNetworkInfo.Text = string.IsNullOrEmpty(_networkIps)
                ? "网络: localhost  |  登录: admin / admin123"
                : $"网络: {_networkIps}  |  登录: admin / admin123";
        }
        catch { lblNetworkInfo.Text = "登录: admin / admin123"; }
    }

    private void UpdateTrayText()
    {
        _trayIcon.Text = $"OMI 管理 | 后端{(_backendRunning ? "✅" : "❌")} 前端{(_frontendRunning ? "✅" : "❌")}";
    }

    // ==================== PORT DETECTION ====================
    private async Task<(bool inUse, int pid)> IsPortInUseAsync(int port)
    {
        try
        {
            using var proc = new Process
            {
                StartInfo = new ProcessStartInfo
                { FileName = "netstat", Arguments = "-ano", UseShellExecute = false, RedirectStandardOutput = true, CreateNoWindow = true }
            };
            proc.Start();
            string output = await proc.StandardOutput.ReadToEndAsync();
            await proc.WaitForExitAsync();
            foreach (string line in output.Split('\n'))
                if (line.Contains($":{port} ") && line.Contains("LISTENING"))
                {
                    var parts = line.Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
                    if (parts.Length >= 5 && int.TryParse(parts[^1], out int p)) return (true, p);
                }
        }
        catch { }
        return (false, 0);
    }

    // 保留同步版本供需要时使用（但优先用异步版本）
    private bool IsPortInUse(int port, out int pid)
    {
        var (inUse, p) = IsPortInUseAsync(port).GetAwaiter().GetResult();
        pid = p;
        return inUse;
    }

    // ==================== OPERATIONS ====================
    private async Task ExecuteAction(string action)
    {
        if (_isOperating) return;
        _isOperating = true; SetButtonsEnabled(false);
        var names = new Dictionary<string, string> { ["start"] = "启动全部服务", ["stop"] = "停止全部服务", ["restart"] = "重启全部服务" };
        AppendLog("▶ " + names.GetValueOrDefault(action, action) + "...");
        try
        {
            using var proc = new Process
            {
                StartInfo = new ProcessStartInfo
                {
                    FileName = "powershell",
                    Arguments = $"-ExecutionPolicy Bypass -File \"{_manageScript}\" {action}",
                    UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true, CreateNoWindow = true
                }, EnableRaisingEvents = true
            };
            var tcs = new TaskCompletionSource<bool>(); proc.Exited += (s, e) => tcs.TrySetResult(true);
            proc.Start();
            string stdout = await proc.StandardOutput.ReadToEndAsync();
            string stderr = await proc.StandardError.ReadToEndAsync();
            await Task.WhenAny(tcs.Task, Task.Delay(30000));
            if (!string.IsNullOrWhiteSpace(stdout))
                foreach (var line in stdout.Split('\n'))
                { var t = line.Trim(); if (!string.IsNullOrEmpty(t)) AppendLog("  " + t); }
            if (!string.IsNullOrWhiteSpace(stderr))
                foreach (var line in stderr.Split('\n'))
                { var t = line.Trim(); if (!string.IsNullOrEmpty(t)) AppendLog("  [错误] " + t); }
        }
        catch (Exception ex) { AppendLog("  异常: " + ex.Message); }
        SetButtonsEnabled(true); _isOperating = false;
        await Task.Delay(500); await RefreshStatusAsync(); DetectNetworkIps();
    }

    private async Task StartSingleService(string service)
    {
        if (_isOperating) return;
        bool running = service == "backend" ? _backendRunning : _frontendRunning;
        if (running) { AppendLog(service + " 已在运行中"); return; }

        _isOperating = true; SetButtonsEnabled(false);
        string python = Path.Combine(_projectRoot, ".venv-1", "Scripts", "python.exe");
        string backendScript = Path.Combine(_projectRoot, "backend", "run_server.py");
        string vitePath = Path.Combine(_projectRoot, "frontend", "node_modules", ".bin", "vite.cmd");
        string frontendDir = Path.Combine(_projectRoot, "frontend");

        AppendLog("▶ 启动 " + service + "...");
        try
        {
            if (service == "backend")
                Process.Start(new ProcessStartInfo { FileName = "cmd", Arguments = $"/c start \"OMI Backend\" /B \"{python}\" \"{backendScript}\"", UseShellExecute = false, CreateNoWindow = true });
            else
                Process.Start(new ProcessStartInfo { FileName = "cmd", Arguments = $"/c start \"OMI Frontend\" /B \"{vitePath}\"", WorkingDirectory = frontendDir, UseShellExecute = false, CreateNoWindow = true });
            await Task.Delay(3000); await RefreshStatusAsync();
            bool ok = service == "backend" ? _backendRunning : _frontendRunning;
            AppendLog(ok ? "  ✔ " + service + " 启动成功" : "  ⚠ " + service + " 启动中...");
        }
        catch (Exception ex) { AppendLog("  ✖ " + ex.Message); }
        SetButtonsEnabled(true); _isOperating = false;
    }

    private async Task StopSingleService(string service)
    {
        if (_isOperating) return;
        bool running = service == "backend" ? _backendRunning : _frontendRunning;
        int pid = service == "backend" ? _backendPid : _frontendPid;
        if (!running) { AppendLog(service + " 未在运行"); return; }

        _isOperating = true; SetButtonsEnabled(false);
        AppendLog("▶ 停止 " + service + " (PID:" + pid + ")...");
        try
        {
            var killProc = Process.Start(new ProcessStartInfo { FileName = "taskkill", Arguments = $"/F /PID {pid}", UseShellExecute = false, CreateNoWindow = true });
            if (killProc != null) await Task.WhenAny(killProc.WaitForExitAsync(), Task.Delay(5000));
            await Task.Delay(1000); await RefreshStatusAsync();
            bool stopped = service == "backend" ? !_backendRunning : !_frontendRunning;
            AppendLog(stopped ? "  ✔ " + service + " 已停止" : "  ⚠ 停止失败");
        }
        catch (Exception ex) { AppendLog("  ✖ " + ex.Message); }
        SetButtonsEnabled(true); _isOperating = false;
    }

    // ==================== CLIPBOARD ====================
    private void CopyLinksToClipboard()
    {
        var sb = new StringBuilder();
        sb.AppendLine("OMI 服务链接:");
        sb.AppendLine("  前端:    http://localhost:3000");
        sb.AppendLine("  API文档: http://localhost:8000/docs");
        if (!string.IsNullOrEmpty(_networkIps))
            foreach (var ip in _networkIps.Split(", "))
                sb.AppendLine("  网络:    http://" + ip + ":3000");
        sb.AppendLine("  登录:    admin / admin123");
        Clipboard.SetText(sb.ToString());
        AppendLog("✔ 链接信息已复制到剪贴板");
    }

    // ==================== HELPERS ====================
    private void SetButtonsEnabled(bool enabled)
    {
        foreach (var btn in new Button[] { btnStartAll, btnStopAll, btnRestartAll,
            btnStartBackend, btnStopBackend, btnStartFrontend, btnStopFrontend,
            btnRefresh, btnCopyLinks, btnClearLog })
        {
            if (btn == null) continue;
            btn.Enabled = enabled;
            if (!enabled) { btn.BackColor = Color.FromArgb(60, 60, 65); btn.ForeColor = Color.FromArgb(120, 120, 120); }
        }
        if (enabled) RestoreButtonColors();
    }

    private void RestoreButtonColors()
    {
        btnStartAll.BackColor    = Green;                           btnStartAll.ForeColor    = Color.White;
        btnStopAll.BackColor     = Red;                             btnStopAll.ForeColor     = Color.White;
        btnRestartAll.BackColor  = Orange;                          btnRestartAll.ForeColor  = Color.White;
        btnRefresh.BackColor     = Color.FromArgb(120, 120, 130);  btnRefresh.ForeColor     = Color.White;
        btnCopyLinks.BackColor   = Color.FromArgb(80, 130, 180);   btnCopyLinks.ForeColor   = Color.White;
        btnStartBackend.BackColor   = Blue;                         btnStartBackend.ForeColor   = Color.White;
        btnStopBackend.BackColor    = Color.FromArgb(180, 80, 80);  btnStopBackend.ForeColor    = Color.White;
        btnStartFrontend.BackColor  = Blue;                         btnStartFrontend.ForeColor  = Color.White;
        btnStopFrontend.BackColor   = Color.FromArgb(180, 80, 80);  btnStopFrontend.ForeColor   = Color.White;
        btnClearLog.BackColor       = Color.FromArgb(70, 70, 75);  btnClearLog.ForeColor       = TextSecondary;
    }

    private GroupBox CreateGroupBox(string title)
    {
        return new GroupBox
        {
            Text = " " + title + " ", Dock = DockStyle.Fill,
            Font = new Font("Segoe UI", 9.5f, FontStyle.Bold),
            ForeColor = Color.FromArgb(120, 180, 220), Padding = new Padding(6)
        };
    }

    private void AppendLog(string message)
    {
        if (txtLog.InvokeRequired) { txtLog.BeginInvoke(() => AppendLog(message)); return; }
        txtLog.AppendText("[" + DateTime.Now.ToString("HH:mm:ss") + "] " + message + "\n");
        txtLog.ScrollToCaret();
        if (txtLog.Lines.Length > 500)
        {
            var lines = txtLog.Lines;
            txtLog.Text = string.Join("\n", lines.Skip(lines.Length - 300));
            txtLog.ScrollToCaret();
        }
    }

    private void OpenUrl(string url)
    {
        try { Process.Start(new ProcessStartInfo { FileName = url, UseShellExecute = true }); }
        catch (Exception ex) { AppendLog("✖ 无法打开链接: " + ex.Message); }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) { _statusTimer?.Dispose(); _trayIcon?.Dispose(); _trayMenu?.Dispose(); }
        base.Dispose(disposing);
    }
}