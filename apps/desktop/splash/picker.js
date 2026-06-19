const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

const statusBox = document.getElementById('status');
const statusSpinner = document.getElementById('status-spinner');
const statusTitle = document.getElementById('status-title');
const statusMessage = document.getElementById('status-message');
const logTail = document.getElementById('log-tail');
const statusActions = document.getElementById('status-actions');
const projectsBox = document.getElementById('projects');
const errorBanner = document.getElementById('error-banner');

let registry = { projects: [], active_id: null };
let phase = { phase: 'idle' };

function projectName(id) {
  const project = registry.projects.find((p) => p.id === id);
  return project ? project.name : id;
}

function showError(message) {
  errorBanner.textContent = message;
  errorBanner.classList.add('visible');
}

function clearError() {
  errorBanner.textContent = '';
  errorBanner.classList.remove('visible');
}

function actionButton(label, onClick, primary) {
  const button = document.createElement('button');
  button.textContent = label;
  if (primary) button.classList.add('primary');
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await onClick();
    } catch (err) {
      showError(String(err));
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

function renderStatus() {
  statusActions.replaceChildren();
  logTail.classList.remove('visible');
  statusBox.classList.remove('failed');
  statusMessage.textContent = '';

  if (phase.phase === 'starting') {
    statusBox.classList.add('visible');
    statusSpinner.style.display = '';
    statusTitle.textContent = `Starting ${projectName(phase.project_id)}…`;
  } else if (phase.phase === 'failed') {
    statusBox.classList.add('visible', 'failed');
    statusSpinner.style.display = 'none';
    statusTitle.textContent = `${projectName(phase.project_id)} failed to start`;
    statusMessage.textContent = phase.message;
    if (phase.log_tail && phase.log_tail.length > 0) {
      logTail.textContent = phase.log_tail.join('\n');
      logTail.classList.add('visible');
    }
    statusActions.append(actionButton('Retry', retryBoot, true));
  } else if (phase.phase === 'running') {
    statusBox.classList.add('visible');
    statusSpinner.style.display = 'none';
    statusTitle.textContent = `${projectName(phase.project_id)} is running`;
    statusActions.append(
      actionButton('Open Dashboard', () => selectProject(phase.project_id), true),
    );
  } else {
    statusBox.classList.remove('visible');
  }
}

function renderProjects() {
  projectsBox.replaceChildren();
  if (registry.projects.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = 'No projects yet.';
    projectsBox.append(empty);
    return;
  }
  const sorted = [...registry.projects].sort((a, b) =>
    (b.last_opened_at || '').localeCompare(a.last_opened_at || ''),
  );
  for (const project of sorted) {
    const row = document.createElement('div');
    row.className = 'project';
    if (project.id === registry.active_id) row.classList.add('active');
    row.setAttribute('role', 'button');
    row.tabIndex = 0;
    row.addEventListener('click', () => selectProject(project.id));
    row.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectProject(project.id);
      }
    });

    const info = document.createElement('div');
    info.className = 'project-info';
    const name = document.createElement('div');
    name.className = 'project-name';
    name.textContent = project.name;
    const path = document.createElement('div');
    path.className = 'project-path';
    path.textContent = project.path;
    info.append(name, path);
    row.append(info);

    const badge = document.createElement('span');
    badge.className = project.has_linear_key ? 'badge badge--ok' : 'badge';
    badge.textContent = project.has_linear_key ? 'Linear ✓' : 'Linear —';
    row.append(badge);

    const configure = document.createElement('button');
    configure.className = 'icon-button';
    configure.textContent = '⚙';
    configure.title = 'Configure the Linear API key for this project';
    configure.addEventListener('click', (event) => {
      event.stopPropagation();
      openConfig(project, false);
    });
    row.append(configure);

    if (project.id !== registry.active_id) {
      const remove = document.createElement('button');
      remove.className = 'icon-button';
      remove.textContent = '✕';
      remove.title = 'Remove from the list (the repo itself is untouched)';
      remove.addEventListener('click', async (event) => {
        event.stopPropagation();
        try {
          await invoke('remove_project', { id: project.id });
          await refreshRegistry();
        } catch (err) {
          showError(String(err));
        }
      });
      row.append(remove);
    }
    projectsBox.append(row);
  }
}

async function refreshRegistry() {
  registry = await invoke('list_projects');
  renderProjects();
  renderStatus();
}

async function selectProject(id) {
  clearError();
  try {
    await invoke('select_project', { id });
    await refreshRegistry();
  } catch (err) {
    showError(String(err));
  }
}

async function retryBoot() {
  clearError();
  await invoke('retry_boot');
}

async function addProject() {
  clearError();
  try {
    const path = await invoke('plugin:dialog|open', {
      options: { directory: true, multiple: false, title: 'Choose a git repository' },
    });
    if (!path) return;
    const project = await invoke('add_project', { path });
    await refreshRegistry();
    // Deduped re-add returns an existing project — open it directly; new ones get the key prompt first.
    if (project.has_linear_key) {
      await selectProject(project.id);
    } else {
      openConfig(project, true);
    }
  } catch (err) {
    showError(String(err));
  }
}

const configOverlay = document.getElementById('config-overlay');
const configTitle = document.getElementById('config-title');
const configInput = document.getElementById('config-linear-key');
const configSave = document.getElementById('config-save');
const configSkip = document.getElementById('config-skip');
let configTarget = null;

function openConfig(project, openAfter) {
  configTarget = { id: project.id, openAfter };
  configTitle.textContent = `Configure ${project.name}`;
  configSkip.textContent = openAfter ? 'Skip & Open' : 'Cancel';
  configInput.value = '';
  configInput.placeholder = project.has_linear_key
    ? 'a key is set — leave blank to keep it, type to replace'
    : 'lin_api_…';
  configOverlay.classList.add('visible');
  configInput.focus();
}

function closeConfig() {
  configOverlay.classList.remove('visible');
  configTarget = null;
}

configSave.addEventListener('click', async () => {
  if (!configTarget) return;
  const { id, openAfter } = configTarget;
  const value = configInput.value.trim();
  clearError();
  try {
    // Blank input keeps an existing key (the placeholder says so); a fresh project has nothing to save.
    if (value) {
      await invoke('configure_project', { id, linearApiKey: value });
    }
    closeConfig();
    if (openAfter) {
      await selectProject(id);
    } else {
      await refreshRegistry();
    }
  } catch (err) {
    showError(String(err));
    closeConfig();
  }
});

configSkip.addEventListener('click', async () => {
  if (!configTarget) return;
  const { id, openAfter } = configTarget;
  closeConfig();
  if (openAfter) {
    await selectProject(id);
  }
});

document.getElementById('add-project').addEventListener('click', addProject);

listen('superkick://boot', (event) => {
  phase = event.payload;
  renderStatus();
  renderProjects();
});

(async () => {
  try {
    [registry, phase] = await Promise.all([
      invoke('list_projects'),
      invoke('boot_state'),
    ]);
  } catch (err) {
    showError(String(err));
  }
  renderProjects();
  renderStatus();
})();
