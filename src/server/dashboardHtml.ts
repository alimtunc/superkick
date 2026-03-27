export const dashboardHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>agent-daemon — Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
      background: #0d1117;
      color: #c9d1d9;
      padding: 24px;
    }

    h1 {
      font-size: 20px;
      font-weight: 600;
      color: #f0f6fc;
      margin-bottom: 8px;
    }

    .subtitle {
      color: #8b949e;
      font-size: 13px;
      margin-bottom: 24px;
    }

    .status-bar {
      display: flex;
      gap: 16px;
      margin-bottom: 24px;
      font-size: 13px;
    }

    .stat {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 12px 16px;
      min-width: 100px;
    }

    .stat-label { color: #8b949e; font-size: 11px; text-transform: uppercase; }
    .stat-value { font-size: 22px; font-weight: 600; margin-top: 4px; }
    .stat-value.running { color: #f0883e; }
    .stat-value.completed { color: #3fb950; }
    .stat-value.failed { color: #f85149; }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    thead th {
      text-align: left;
      padding: 8px 12px;
      border-bottom: 1px solid #30363d;
      color: #8b949e;
      font-weight: 500;
      font-size: 11px;
      text-transform: uppercase;
    }

    tbody tr {
      cursor: pointer;
      transition: background 0.1s;
    }

    tbody tr:hover { background: #161b22; }
    tbody tr.selected { background: #1c2128; }

    tbody td {
      padding: 10px 12px;
      border-bottom: 1px solid #21262d;
    }

    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }

    .badge-running { background: #f0883e20; color: #f0883e; }
    .badge-completed { background: #3fb95020; color: #3fb950; }
    .badge-failed { background: #f8514920; color: #f85149; }
    .badge-cancelled { background: #8b949e20; color: #8b949e; }
    .badge-unknown { background: #8b949e20; color: #8b949e; }

    .detail-panel {
      position: fixed;
      top: 0;
      right: -600px;
      width: 600px;
      height: 100vh;
      background: #161b22;
      border-left: 1px solid #30363d;
      transition: right 0.2s ease;
      display: flex;
      flex-direction: column;
      z-index: 10;
    }

    .detail-panel.open { right: 0; }

    .detail-header {
      padding: 16px 20px;
      border-bottom: 1px solid #30363d;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .detail-header h2 { font-size: 15px; color: #f0f6fc; }

    .detail-actions {
      display: flex;
      gap: 8px;
    }

    .btn {
      padding: 6px 12px;
      border-radius: 6px;
      border: 1px solid #30363d;
      background: #21262d;
      color: #c9d1d9;
      font-size: 12px;
      cursor: pointer;
    }

    .btn:hover { border-color: #8b949e; }
    .btn-danger { border-color: #f8514960; color: #f85149; }
    .btn-danger:hover { background: #f8514920; }

    .detail-meta {
      padding: 12px 20px;
      border-bottom: 1px solid #30363d;
      font-size: 12px;
      color: #8b949e;
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
    }

    .detail-meta span { display: inline-flex; gap: 4px; }

    .logs-container {
      flex: 1;
      overflow-y: auto;
      padding: 12px 20px;
      font-family: "SF Mono", "Fira Code", monospace;
      font-size: 12px;
      line-height: 1.6;
    }

    .log-line {
      display: flex;
      gap: 8px;
    }

    .log-time { color: #484f58; min-width: 80px; flex-shrink: 0; }
    .log-step { color: #58a6ff; min-width: 100px; flex-shrink: 0; }
    .log-msg { color: #c9d1d9; word-break: break-all; }
    .log-msg.warn { color: #f0883e; }
    .log-msg.error { color: #f85149; }
    .log-msg.stderr { color: #f0883e; }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: #484f58;
    }

    .empty-state h3 { font-size: 16px; margin-bottom: 8px; color: #8b949e; }

    .refresh-indicator {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #3fb950;
      margin-left: 8px;
      animation: pulse 2s infinite;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.3; }
    }

    .overlay {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: #0d111780;
      z-index: 5;
    }

    .overlay.open { display: block; }
  </style>
</head>
<body>
  <h1>agent-daemon <span class="refresh-indicator"></span></h1>
  <p class="subtitle">Workflow dashboard — auto-refreshes every 5s</p>

  <div class="status-bar">
    <div class="stat">
      <div class="stat-label">Running</div>
      <div class="stat-value running" id="count-running">—</div>
    </div>
    <div class="stat">
      <div class="stat-label">Completed</div>
      <div class="stat-value completed" id="count-completed">—</div>
    </div>
    <div class="stat">
      <div class="stat-label">Failed</div>
      <div class="stat-value failed" id="count-failed">—</div>
    </div>
    <div class="stat">
      <div class="stat-label">Total</div>
      <div class="stat-value" id="count-total">—</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Workflow</th>
        <th>Status</th>
        <th>Started</th>
        <th>Duration</th>
      </tr>
    </thead>
    <tbody id="workflow-list"></tbody>
  </table>

  <div id="empty" class="empty-state" style="display:none">
    <h3>No workflows yet</h3>
    <p>Workflows will appear here when Linear issues are processed.</p>
  </div>

  <div id="overlay" class="overlay" onclick="closePanel()"></div>
  <div id="detail-panel" class="detail-panel">
    <div class="detail-header">
      <h2 id="detail-title">—</h2>
      <div class="detail-actions">
        <button class="btn btn-danger" id="btn-cancel" onclick="cancelWorkflow()">Cancel</button>
        <button class="btn" onclick="closePanel()">Close</button>
      </div>
    </div>
    <div class="detail-meta" id="detail-meta"></div>
    <div class="logs-container" id="logs-container"></div>
  </div>

  <script>
    let currentWorkflowId = null;
    let eventSource = null;
    let workflows = [];

    // ─── Helpers ──────────────────────────────────────────────────

    function statusBadge(status) {
      const s = status.toLowerCase();
      let cls = "unknown";
      if (s === "running") cls = "running";
      else if (s === "completed") cls = "completed";
      else if (s === "failed" || s === "terminated") cls = "failed";
      else if (s === "cancelled" || s === "canceled") cls = "cancelled";
      return '<span class="badge badge-' + cls + '">' + status + '</span>';
    }

    function ago(iso) {
      if (!iso) return "—";
      const diff = Date.now() - new Date(iso).getTime();
      const s = Math.floor(diff / 1000);
      if (s < 60) return s + "s ago";
      const m = Math.floor(s / 60);
      if (m < 60) return m + "m ago";
      const h = Math.floor(m / 60);
      if (h < 24) return h + "h ago";
      return Math.floor(h / 24) + "d ago";
    }

    function duration(start, end) {
      if (!start) return "—";
      const s = ((end ? new Date(end) : new Date()) - new Date(start)) / 1000;
      if (s < 60) return Math.round(s) + "s";
      const m = Math.floor(s / 60);
      const rem = Math.round(s % 60);
      return m + "m " + rem + "s";
    }

    function formatTime(iso) {
      if (!iso) return "";
      const d = new Date(iso);
      return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }

    // ─── Fetch workflows ─────────────────────────────────────────

    async function fetchWorkflows() {
      try {
        const res = await fetch("/api/workflows");
        if (!res.ok) return;
        workflows = await res.json();
        renderList();
      } catch (e) {
        console.error("Failed to fetch workflows:", e);
      }
    }

    function renderList() {
      const tbody = document.getElementById("workflow-list");
      const empty = document.getElementById("empty");

      if (workflows.length === 0) {
        tbody.innerHTML = "";
        empty.style.display = "block";
        return;
      }

      empty.style.display = "none";

      // Stats
      const running = workflows.filter(w => w.status === "RUNNING").length;
      const completed = workflows.filter(w => w.status === "COMPLETED").length;
      const failed = workflows.filter(w => ["FAILED", "TERMINATED"].includes(w.status)).length;

      document.getElementById("count-running").textContent = running;
      document.getElementById("count-completed").textContent = completed;
      document.getElementById("count-failed").textContent = failed;
      document.getElementById("count-total").textContent = workflows.length;

      tbody.innerHTML = workflows.map(w =>
        '<tr onclick="openPanel(\\'' + w.workflowId + '\\')" class="' + (w.workflowId === currentWorkflowId ? "selected" : "") + '">' +
          "<td><strong>" + w.workflowId + "</strong></td>" +
          "<td>" + statusBadge(w.status) + "</td>" +
          "<td>" + ago(w.startTime) + "</td>" +
          "<td>" + duration(w.startTime, w.closeTime) + "</td>" +
        "</tr>"
      ).join("");
    }

    // ─── Detail panel ────────────────────────────────────────────

    function openPanel(workflowId) {
      currentWorkflowId = workflowId;
      document.getElementById("detail-panel").classList.add("open");
      document.getElementById("overlay").classList.add("open");

      const wf = workflows.find(w => w.workflowId === workflowId);
      document.getElementById("detail-title").textContent = workflowId;
      document.getElementById("detail-meta").innerHTML = [
        "<span>Status: " + (wf ? statusBadge(wf.status) : "—") + "</span>",
        "<span>Started: " + (wf?.startTime ? new Date(wf.startTime).toLocaleString() : "—") + "</span>",
        "<span>Duration: " + (wf ? duration(wf.startTime, wf.closeTime) : "—") + "</span>",
      ].join("");

      // Show/hide cancel button
      const cancelBtn = document.getElementById("btn-cancel");
      cancelBtn.style.display = wf?.status === "RUNNING" ? "" : "none";

      // Clear and start SSE
      document.getElementById("logs-container").innerHTML = "";
      startSSE(workflowId);

      renderList(); // update selected row
    }

    function closePanel() {
      currentWorkflowId = null;
      document.getElementById("detail-panel").classList.remove("open");
      document.getElementById("overlay").classList.remove("open");
      stopSSE();
      renderList();
    }

    // ─── SSE Logs ────────────────────────────────────────────────

    function startSSE(workflowId) {
      stopSSE();
      eventSource = new EventSource("/api/workflows/" + workflowId + "/logs");
      eventSource.addEventListener("log", (e) => {
        try {
          const entry = JSON.parse(e.data);
          appendLogLine(entry);
        } catch {}
      });
    }

    function stopSSE() {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    }

    function appendLogLine(entry) {
      const container = document.getElementById("logs-container");
      const div = document.createElement("div");
      div.className = "log-line";

      let msgClass = "";
      if (entry.level === "warn" || entry.level === "stderr") msgClass = entry.level;
      if (entry.level === "error") msgClass = "error";

      div.innerHTML =
        '<span class="log-time">' + formatTime(entry.ts) + '</span>' +
        '<span class="log-step">' + entry.step + '</span>' +
        '<span class="log-msg ' + msgClass + '">' + escapeHtml(entry.message) + '</span>';

      container.appendChild(div);
      container.scrollTop = container.scrollHeight;
    }

    function escapeHtml(str) {
      return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    // ─── Cancel workflow ─────────────────────────────────────────

    async function cancelWorkflow() {
      if (!currentWorkflowId) return;
      if (!confirm("Cancel workflow " + currentWorkflowId + "?")) return;

      try {
        await fetch("/api/workflows/" + currentWorkflowId + "/cancel", { method: "POST" });
        await fetchWorkflows();
        if (currentWorkflowId) openPanel(currentWorkflowId);
      } catch (e) {
        alert("Failed to cancel: " + e.message);
      }
    }

    // ─── Init ────────────────────────────────────────────────────

    fetchWorkflows();
    setInterval(fetchWorkflows, 5000);
  </script>
</body>
</html>`;
