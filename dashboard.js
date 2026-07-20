/**
 * FleetVision AI — Dynamic Role-Based Operations Dashboard Controller
 * Enforces server-side authorization checks and populates real-time telemetry & audit feeds.
 */

document.addEventListener('DOMContentLoaded', async () => {
  const userNameElem = document.getElementById('userName');
  const userRoleTagElem = document.getElementById('userRoleTag');
  const userAvatarElem = document.getElementById('userAvatar');
  const bannerRoleTitleElem = document.getElementById('bannerRoleTitle');
  const bannerRoleDescElem = document.getElementById('bannerRoleDesc');
  const permissionsPillsElem = document.getElementById('permissionsPills');
  const logoutBtn = document.getElementById('logoutBtn');
  const btnSubmitInspection = document.getElementById('btnSubmitInspection');
  const btnNewRoute = document.getElementById('btnNewRoute');

  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) {
      window.location.href = 'index.html';
      return;
    }

    const data = await res.json();
    const user = data.user;
    const permissions = data.permissions || [];

    // Populate user profile badge
    userNameElem.textContent = user.name || user.username;
    userRoleTagElem.textContent = `${user.title} (${user.badge})`;

    // Avatar initials
    const initials = (user.name || user.username)
      .split(' ')
      .map(n => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
    userAvatarElem.textContent = initials;

    // Populate role banner
    bannerRoleTitleElem.textContent = `${user.title} — Fleet Control Center`;
    bannerRoleDescElem.textContent = data.roleDescription || 'Role clearance active.';

    // Populate active permissions pills
    permissionsPillsElem.innerHTML = '';
    permissions.forEach(perm => {
      const pill = document.createElement('span');
      pill.className = 'perm-pill';
      pill.textContent = perm;
      permissionsPillsElem.appendChild(pill);
    });

    // Enforce Module Visibility in DOM
    const gatedModules = document.querySelectorAll('.perm-gated');
    gatedModules.forEach(mod => {
      const requiredPerms = (mod.getAttribute('data-perm') || '').split(',');
      const hasPermission = requiredPerms.some(rp => permissions.includes(rp.trim()));

      if (hasPermission) {
        mod.classList.remove('hidden');
      } else {
        mod.classList.add('hidden');
      }
    });

    // Fetch Protected Real-Time Telematics if Authorized
    if (permissions.includes('telematics:full') || permissions.includes('fleet:monitor')) {
      try {
        const teleRes = await fetch('/api/fleet/telematics');
        if (teleRes.ok) {
          const teleData = await teleRes.json();
          const listContainer = document.querySelector('.fleet-units-list');
          if (listContainer && teleData.units) {
            listContainer.innerHTML = '';
            teleData.units.forEach(u => {
              const row = document.createElement('div');
              row.className = `unit-row ${u.id.includes('402') ? 'highlight' : ''}`;
              row.innerHTML = `
                <span class="unit-id">${u.id} (${u.model})</span>
                <span class="unit-speed">${u.speed}</span>
                <span class="unit-route">${u.route}</span>
                <span class="unit-status ${u.status.includes('Charge') ? 'status-charging' : 'status-moving'}">${u.status}</span>
              `;
              listContainer.appendChild(row);
            });
          }
        }
      } catch (e) {
        console.warn('Telematics API fetch error:', e);
      }
    }

    // Fetch Protected Audit Logs if Authorized (Admin Only)
    if (permissions.includes('audit:view')) {
      try {
        const auditRes = await fetch('/api/audit/logs');
        if (auditRes.ok) {
          const auditData = await auditRes.json();
          const auditStream = document.querySelector('.audit-stream');
          if (auditStream && auditData.logs) {
            auditStream.innerHTML = '';
            auditData.logs.slice(0, 5).forEach(log => {
              const row = document.createElement('div');
              row.className = 'audit-row';
              const tagClass = log.severity === 'ALERT' ? 'tag-warn' : (log.severity === 'WARN' ? 'tag-warn' : 'tag-success');
              row.innerHTML = `
                <span class="audit-time">${log.timeString || '12:00:00'}</span>
                <span class="audit-tag ${tagClass}">${log.eventType}</span>
                <span class="audit-msg">${log.details} [User: ${log.user} • IP: ${log.ip}]</span>
              `;
              auditStream.appendChild(row);
            });
          }
        }
      } catch (e) {
        console.warn('Audit logs API fetch error:', e);
      }
    }

  } catch (err) {
    console.warn('Backend /api/auth/me unavailable.');
  }

  // Handle Logout
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch (e) {
        // ignore
      }
      window.location.href = 'index.html';
    });
  }

  // Interactive buttons
  if (btnSubmitInspection) {
    btnSubmitInspection.addEventListener('click', () => {
      btnSubmitInspection.textContent = '✓ Digital Sign-Off Dispatched';
      btnSubmitInspection.style.background = '#16a34a';
      setTimeout(() => {
        btnSubmitInspection.textContent = 'Submit Inspection Sign-Off';
        btnSubmitInspection.style.background = '';
      }, 3000);
    });
  }

  if (btnNewRoute) {
    btnNewRoute.addEventListener('click', () => {
      alert('Dispatch Modal: Enter New Cargo Manifest & Assign Telematics Unit.');
    });
  }
});
