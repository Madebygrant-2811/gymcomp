import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import * as XLSX from "xlsx";
import { gymnast_key, denseRank } from "./scoring.js";

const escHtml = (s) => {
  if (s == null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
};

export const getApparatusIcon = () => "";

export function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function formatTime(t) {
  if (!t) return "—";
  const [h, m] = t.split(":");
  const hour = parseInt(h);
  const ampm = hour >= 12 ? "pm" : "am";
  const h12 = hour % 12 || 12;
  return `${h12}:${m}${ampm}`;
}

export function getPrintHeader(compData, subtitle) {
  const colour = "#000dff";
  return `
    <div class="print-header">
      <div class="print-header-top" style="border-bottom: 3px solid ${colour};">
        <div class="print-header-text">
          <div class="print-comp-name" style="color:${colour};">${escHtml(compData.name) || "Competition"}</div>
          ${compData.organiserName ? `<div class="print-organiser">${escHtml(compData.organiserName)}</div>` : ""}
          <div class="print-meta">
            ${compData.date ? formatDate(compData.date) : ""}
            ${compData.venue ? ` &nbsp;·&nbsp; ${escHtml(compData.venue)}` : ""}
          </div>
        </div>
        <div class="print-subtitle-badge" style="background:${colour}; color:#000;">${escHtml(subtitle)}</div>
      </div>
    </div>
  `;
}

export const PRINT_BASE_CSS = `
  @media print { @page { margin: 15mm 12mm 20mm 12mm; } }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 11px; color: #111; background: #fff; }
  .print-header { margin-bottom: 18px; }
  .print-header-top { display: flex; align-items: center; gap: 16px; padding-bottom: 12px; margin-bottom: 12px; }
  .print-logo { height: 56px; max-width: 140px; object-fit: contain; }
  .print-header-text { flex: 1; }
  .print-comp-name { font-size: 22px; font-weight: 800; letter-spacing: 0.5px; line-height: 1.1; }
  .print-organiser { font-size: 13px; font-weight: 600; color: #444; margin-top: 2px; }
  .print-meta { font-size: 11px; color: #666; margin-top: 4px; }
  .print-subtitle-badge { font-size: 10px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; padding: 5px 12px; border-radius: 4px; white-space: nowrap; align-self: flex-start; }
  .print-footer { margin-top: 24px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 9px; color: #999; display: flex; justify-content: space-between; }
  h2 { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; margin: 18px 0 8px; color: #222; }
  h3 { font-size: 11px; font-weight: 700; margin: 12px 0 6px; color: #333; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { background: #f0f0f0; padding: 6px 10px; text-align: left; font-size: 9px; font-weight: 700; letter-spacing: 0.8px; text-transform: uppercase; color: #444; border: 1px solid #ddd; }
  td { padding: 6px 10px; border: 1px solid #ddd; vertical-align: top; font-size: 10.5px; }
  tr:nth-child(even) td { background: #fafafa; }
  .score-box { border: 1.5px solid #999; border-radius: 3px; display: inline-block; width: 48px; height: 22px; }
  .page-break { page-break-before: always; margin-top: 20px; }
  .round-page { page-break-before: always; padding-bottom: 10px; }
  .round-page:first-child { page-break-before: auto; }
  .round-header { background: #eee; padding: 7px 12px; font-weight: 700; font-size: 12px; border-radius: 4px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
  .round-time { font-size: 10px; color: #666; font-weight: 400; }
  .group-block { margin-bottom: 16px; }
  .group-name { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #555; margin-bottom: 4px; }
  .apparatus-tag { display: inline-block; font-size: 9px; font-weight: 700; padding: 2px 7px; border-radius: 3px; background: #e8e8e8; color: #333; margin-right: 4px; }
`;

export async function generatePDF(fullHTML, filename = "gymcomp-document.pdf") {
  const container = document.createElement("div");
  container.style.cssText = "position:fixed;top:-20000px;left:0;width:794px;background:#fff;z-index:-1;";
  document.body.appendChild(container);
  container.innerHTML = fullHTML;
  // Wait for images (logos) to load
  const imgs = container.querySelectorAll("img");
  if (imgs.length) await Promise.all([...imgs].map(img => img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; })));
  // Small delay for layout
  await new Promise(r => setTimeout(r, 200));

  // Detect page-break positions (container px from container top)
  const containerTop = container.getBoundingClientRect().top;
  const breakPx = [];
  container.querySelectorAll(".page-break").forEach(el => {
    breakPx.push(el.getBoundingClientRect().top - containerTop);
  });
  container.querySelectorAll(".round-page").forEach((el, i) => {
    if (i > 0) breakPx.push(el.getBoundingClientRect().top - containerTop);
  });
  const uniqueBreakPx = [...new Set(breakPx)].filter(b => b > 10).sort((a, b) => a - b);

  try {
    const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: "#ffffff", logging: false, windowWidth: 794 });
    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const marginX = 8;
    const marginTop = 8;
    const marginBottom = 14; // ~40px bottom margin
    const contentW = pageW - marginX * 2;
    const sliceH = pageH - marginTop - marginBottom;
    const mmPerPx = contentW / 794;
    const totalMmH = (canvas.height / canvas.width) * contentW;

    // Convert break positions to mm
    const breaksMm = uniqueBreakPx.map(px => px * mmPerPx);

    // Build page slices — each entry is the startMm for that page
    const slices = [];
    let cursor = 0;
    while (cursor < totalMmH - 0.5) {
      slices.push(cursor);
      let hitBreak = false;
      for (const bp of breaksMm) {
        if (bp > cursor + 1 && bp <= cursor + sliceH) {
          cursor = bp;
          hitBreak = true;
          break;
        }
      }
      if (!hitBreak) cursor += sliceH;
    }

    // Render each page, clipping content at break boundaries
    slices.forEach((startMm, i) => {
      if (i > 0) pdf.addPage();
      const nextStart = i < slices.length - 1 ? slices[i + 1] : startMm + sliceH;
      const contentH = Math.min(nextStart - startMm, sliceH);
      pdf.addImage(imgData, "JPEG", marginX, marginTop - startMm, contentW, totalMmH);
      // White-out: top margin + everything below this page's content
      pdf.setFillColor(255, 255, 255);
      pdf.rect(0, 0, pageW, marginTop, "F");
      pdf.rect(0, marginTop + contentH, pageW, pageH - marginTop - contentH, "F");
    });

    pdf.save(filename);
  } finally {
    document.body.removeChild(container);
  }
}

export function printDocument(htmlContent, filename = "gymcomp-document.pdf") {
  const fullHTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Print</title><style>${PRINT_BASE_CSS}</style></head><body>${htmlContent}</body></html>`;
  generatePDF(fullHTML, filename);
}

// Build agenda content
export function buildAgendaHTML(compData, gymnasts, compId) {
  const colour = "#000dff";
  const rounds = compData.rounds || [];
  const apparatus = (compData.apparatus || []).filter(a => a !== "Rest");
  const levelName = (id) => (compData.levels || []).find(l => l.id === id)?.name || id || "—";

  // Group gymnasts by round then group
  const byRound = {};
  rounds.forEach(r => { byRound[r.id] = {}; });
  gymnasts.forEach(g => {
    if (!g.round || !byRound[g.round]) return;
    if (!byRound[g.round][g.group]) byRound[g.round][g.group] = [];
    byRound[g.round][g.group].push(g);
  });

  // Sort groups numerically (matching Manage Gymnasts order)
  const sortGroupNames = (names) => [...names].sort((a, b) => {
    const na = parseInt(String(a).replace(/\D/g, "")) || 0;
    const nb = parseInt(String(b).replace(/\D/g, "")) || 0;
    return na - nb;
  });

  const compName = escHtml(compData.name) || "Competition";

  let html = "";

  // Header with logo badge (matching Attendance List)
  html += `
    <div class="print-header">
      <div class="print-header-top" style="border-bottom: 3px solid ${colour};">
        <div class="print-header-text">
          <div class="print-comp-name" style="color:${colour};">${compName}</div>
          ${compData.organiserName ? `<div class="print-organiser">${escHtml(compData.organiserName)}</div>` : ""}
          <div class="print-meta">
            ${compData.date ? formatDate(compData.date) : ""}
            ${compData.venue ? ` &nbsp;·&nbsp; ${escHtml(compData.venue)}` : ""}
          </div>
        </div>
        <div style="background:${colour};color:#fff;padding:8px 16px;border-radius:6px;display:flex;align-items:center;gap:10px;white-space:nowrap;align-self:flex-start;">
          <img src="./Logo-mono-white.svg" alt="GymComp" height="16" style="display:block;" />
          <span style="font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;">Competition Agenda</span>
        </div>
      </div>
    </div>
  `;

  // Summary table
  html += `<table style="margin-bottom:20px;">
    <tr><th>Competition</th><th>Date</th><th>Venue</th><th>Levels</th><th>Total Gymnasts</th></tr>
    <tr>
      <td><strong>${compName}</strong></td>
      <td>${compData.date ? formatDate(compData.date) : "—"}</td>
      <td>${escHtml(compData.venue || compData.location) || "—"}</td>
      <td>${(compData.levels || []).map(l => escHtml(l.name)).join(", ") || "—"}</td>
      <td>${gymnasts.length}</td>
    </tr>
  </table>`;

  // Rounds
  rounds.forEach((round, ri) => {
    if (ri > 0) html += `<div class="page-break"></div>`;
    html += `<div class="round-header" style="border-left: 4px solid ${colour};">
      <span>${escHtml(round.name)}</span>
      <span class="round-time">${formatTime(round.start)} – ${formatTime(round.end)}</span>
    </div>`;

    const groups = byRound[round.id] || {};
    const groupNames = sortGroupNames(Object.keys(groups));

    if (!groupNames.length) {
      html += `<p style="color:#999;font-size:10px;padding:8px 0;">No gymnasts assigned to this round.</p>`;
    } else {
      // Gymnast lists per group
      groupNames.forEach(grp => {
        const gList = (groups[grp] || []).sort((a, b) => (parseInt(a.number) || 0) - (parseInt(b.number) || 0));
        html += `<div class="group-block">
          <div class="group-name">${escHtml(grp)} — ${gList.length} gymnast${gList.length !== 1 ? "s" : ""}</div>
          <table>
            <colgroup>
              <col style="width:40px;" />
              <col style="width:auto;" />
              <col style="width:30%;" />
              <col style="width:20%;" />
            </colgroup>
            <thead><tr><th>#</th><th>Name</th><th>Club</th><th>Level</th></tr></thead>
            <tbody>`;
        gList.forEach((g, idx) => {
          html += `<tr>
            <td>${g.number || idx + 1}</td>
            <td>${escHtml(g.name) || "—"}</td>
            <td>${escHtml(g.club) || "—"}</td>
            <td>${escHtml(levelName(g.level))}</td>
          </tr>`;
        });
        html += `</tbody></table></div>`;
      });
    }
  });


  // Live view QR codes (only if compId exists)
  if (compId) {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://gymcomp.app";
    const coachUrl = `${origin}/coach.html?comp=${compId}`;
    const parentUrl = `${origin}/results.html?comp=${compId}`;
    const qrSize = 100;
    const coachQR = "https://quickchart.io/chart?cht=qr&chs=" + qrSize + "x" + qrSize + "&chl=" + encodeURIComponent(coachUrl) + "&choe=UTF-8";
    const parentQR = "https://quickchart.io/chart?cht=qr&chs=" + qrSize + "x" + qrSize + "&chl=" + encodeURIComponent(parentUrl) + "&choe=UTF-8";

    html += "<div class=\"page-break\"></div>" +
    "<h2 style=\"text-align:center;margin-bottom:16px;\">Live Results — Share With Coaches &amp; Parents</h2>" +
    "<p style=\"text-align:center;font-size:10px;color:#666;margin-bottom:20px;\">Scan the QR code or visit the link to follow live scores and rankings during the competition</p>" +
    "<div style=\"display:flex;gap:40px;justify-content:center;flex-wrap:wrap;margin-bottom:24px;\">" +
      "<div style=\"text-align:center;border:1px solid #ddd;border-radius:8px;padding:20px 28px;\">" +
        "<img src=\"" + coachQR + "\" width=\"" + qrSize + "\" height=\"" + qrSize + "\" style=\"display:block;margin:0 auto 10px;\" />" +
        "<div style=\"font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;\">Coach View</div>" +
        "<div style=\"font-size:9px;color:#666;word-break:break-all;max-width:160px;\">" + coachUrl + "</div>" +
        "<div style=\"font-size:9px;color:#888;margin-top:4px;\">Full D/E breakdown + query status</div>" +
      "</div>" +
      "<div style=\"text-align:center;border:1px solid #ddd;border-radius:8px;padding:20px 28px;\">" +
        "<img src=\"" + parentQR + "\" width=\"" + qrSize + "\" height=\"" + qrSize + "\" style=\"display:block;margin:0 auto 10px;\" />" +
        "<div style=\"font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;\">Parent View</div>" +
        "<div style=\"font-size:9px;color:#666;word-break:break-all;max-width:160px;\">" + parentUrl + "</div>" +
        "<div style=\"font-size:9px;color:#888;margin-top:4px;\">Scores + rankings — no technical detail</div>" +
      "</div>" +
    "</div>";
  }

  html += `<div class="print-footer">
    <span>Generated by GymComp · ${new Date().toLocaleDateString("en-GB")}</span>
    <span>${escHtml(compData.organiserName) || ""}</span>
  </div>`;

  return html;
}

// Build judge sheets
export function buildJudgeSheetsHTML(compData, gymnasts) {
  const colour = "#000dff";
  const apparatus = (compData.apparatus || []).filter(a => a !== "Rest");
  const rounds = compData.rounds || [];
  const fig = true;

  let html = "";

  // One sheet per apparatus per round — pre-populated with gymnast details
  apparatus.forEach((app, appIdx) => {
    rounds.forEach((round, rIdx) => {
      const roundGymnasts = gymnasts
        .filter(g => g.round === round.id)
        .sort((a, b) => parseInt(a.number || 0) - parseInt(b.number || 0));

      if (appIdx > 0 || rIdx > 0) html += `<div class="page-break"></div>`;

      html += getPrintHeader(compData, `Judge Score Sheet — ${escHtml(app)}`);

      html += `<div class="round-header" style="border-left:4px solid ${colour};">
        <span>${escHtml(round.name)} · ${getApparatusIcon(app)} ${escHtml(app)}</span>
        <span class="round-time">${formatTime(round.start)} – ${formatTime(round.end)}</span>
      </div>`;

      // Judge assignment info
      const assignedJudges = (compData.judges || []).filter(j => j.apparatus === app);
      if (assignedJudges.length) {
        html += `<div style="background:${colour}18;border:1px solid ${colour}44;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:10px;">
          <strong>Assigned judge${assignedJudges.length !== 1 ? "s" : ""}:</strong>
          ${assignedJudges.map(j => `<strong>${escHtml(j.name)}</strong>${j.club ? ` · ${escHtml(j.club)}` : ""}`).join("&ensp;|&ensp;")}
        </div>`;
      }

      // Competition info strip
      html += `<div style="display:flex;gap:16px;margin-bottom:14px;font-size:9px;color:#555;flex-wrap:wrap;">
        <span><strong>Competition:</strong> ${escHtml(compData.name) || "—"}</span>
        <span><strong>Date:</strong> ${compData.date ? formatDate(compData.date) : "—"}</span>
        <span><strong>Venue:</strong> ${escHtml(compData.venue || compData.location) || "—"}</span>
        <span><strong>Apparatus:</strong> ${escHtml(app)}</span>
        <span><strong>Round:</strong> ${escHtml(round.name)}</span>
        <span><strong>Gymnasts:</strong> ${roundGymnasts.length}</span>
      </div>`;

      // Score table — pre-populated with all gymnast details
      if (fig) {
        html += `<table>
          <thead>
            <tr>
              <th style="width:32px;">#</th>
              <th style="min-width:130px;">Gymnast Name</th>
              <th style="min-width:100px;">Club</th>
              <th style="width:70px;">Level</th>
              <th style="width:48px;text-align:center;">Group</th>
              <th style="width:68px;text-align:center;">D Score</th>
              <th style="width:68px;text-align:center;">E Score</th>
              <th style="width:58px;text-align:center;">Penalty</th>
              <th style="width:72px;text-align:center;">Total</th>
            </tr>
          </thead>
          <tbody>`;

        roundGymnasts.forEach((g, i) => {
          const levelName = (compData.levels || []).find(l => l.id === g.level)?.name || g.level || "—";
          const isDns = !!g.dns;
          html += `<tr style="${isDns ? "opacity:0.4;text-decoration:line-through;" : i % 2 === 0 ? "" : "background:#fafafa;"}">
            <td style="font-weight:700;color:${colour};">${g.number || i + 1}</td>
            <td><strong>${escHtml(g.name) || "—"}</strong>${isDns ? ' <span style="color:#d9534f;font-size:8px;font-weight:700;">DNS</span>' : ""}</td>
            <td style="color:#555;">${escHtml(g.club) || "—"}</td>
            <td style="font-size:9px;color:#666;">${escHtml(levelName)}</td>
            <td style="text-align:center;font-size:10px;color:#666;">${escHtml(g.group) || "—"}</td>
            <td style="text-align:center;"><span class="score-box"></span></td>
            <td style="text-align:center;"><span class="score-box"></span></td>
            <td style="text-align:center;"><span class="score-box" style="width:44px;"></span></td>
            <td style="text-align:center;"><span class="score-box" style="width:56px;border-width:2px;"></span></td>
          </tr>`;
        });
      } else {
        html += `<table>
          <thead>
            <tr>
              <th style="width:32px;">#</th>
              <th style="min-width:130px;">Gymnast Name</th>
              <th style="min-width:100px;">Club</th>
              <th style="width:70px;">Level</th>
              <th style="width:48px;text-align:center;">Group</th>
              <th style="width:100px;text-align:center;">Score</th>
            </tr>
          </thead>
          <tbody>`;

        roundGymnasts.forEach((g, i) => {
          const levelName = (compData.levels || []).find(l => l.id === g.level)?.name || g.level || "—";
          const isDns = !!g.dns;
          html += `<tr style="${isDns ? "opacity:0.4;text-decoration:line-through;" : i % 2 === 0 ? "" : "background:#fafafa;"}">
            <td style="font-weight:700;color:${colour};">${g.number || i + 1}</td>
            <td><strong>${escHtml(g.name) || "—"}</strong>${isDns ? ' <span style="color:#d9534f;font-size:8px;font-weight:700;">DNS</span>' : ""}</td>
            <td style="color:#555;">${escHtml(g.club) || "—"}</td>
            <td style="font-size:9px;color:#666;">${escHtml(levelName)}</td>
            <td style="text-align:center;font-size:10px;color:#666;">${escHtml(g.group) || "—"}</td>
            <td style="text-align:center;"><span class="score-box" style="width:80px;"></span></td>
          </tr>`;
        });
      }

      if (!roundGymnasts.length) {
        html += `<tr><td colspan="9" style="color:#999;text-align:center;padding:16px;">No gymnasts assigned to this round</td></tr>`;
      }

      html += `</tbody></table>`;

      // Signature + handover section
      html += `<div style="margin-top:24px;border-top:1px solid #ddd;padding-top:14px;">
        <div style="display:flex;gap:32px;flex-wrap:wrap;margin-bottom:16px;">
          <div>
            <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;">Judge Signature</span>
            <div style="border-bottom:1.5px solid #999;width:220px;margin-top:20px;"></div>
          </div>
          <div>
            <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;">Scorer Received</span>
            <div style="border-bottom:1.5px solid #999;width:140px;margin-top:20px;"></div>
          </div>
          <div>
            <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;">Time Received</span>
            <div style="border-bottom:1.5px solid #999;width:100px;margin-top:20px;"></div>
          </div>
        </div>
        <div style="font-size:9px;color:#aaa;">
          ${escHtml(compData.name) || ""} · ${escHtml(round.name)} · ${escHtml(app)} · ${compData.date ? formatDate(compData.date) : ""}
        </div>
      </div>`;

      html += `<div class="print-footer">
        <span>GYMCOMP · ${escHtml(compData.name) || ""} · ${compData.date ? formatDate(compData.date) : ""}</span>
        <span>${escHtml(app)} / ${escHtml(round.name)}</span>
      </div>`;
    });
  });

  return html || `<p style="color:#999;">No apparatus configured.</p>`;
}

// Build attendance list
export function buildAttendanceHTML(compData, gymnasts) {
  const colour = "#000dff";
  const levelName = (id) => (compData.levels || []).find(l => l.id === id)?.name || id || "—";
  const rounds = compData.rounds || [];
  const compName = escHtml(compData.name) || "Competition";

  let html = "";

  // One page per round
  rounds.forEach((round, ri) => {
    const roundGymnasts = [...gymnasts.filter(g => g.round === round.id)].sort((a, b) => (a.number || 0) - (b.number || 0));
    if (!roundGymnasts.length) return;

    // Each round on its own page
    html += `<div class="round-page">`;

    // Custom header: comp name with round suffix, blue badge with logo
    html += `
      <div class="print-header">
        <div class="print-header-top" style="border-bottom: 3px solid ${colour};">
          <div class="print-header-text">
            <div class="print-comp-name" style="color:${colour};">${compName} — ${escHtml(round.name)}</div>
            ${compData.organiserName ? `<div class="print-organiser">${escHtml(compData.organiserName)}</div>` : ""}
            <div class="print-meta">
              ${compData.date ? formatDate(compData.date) : ""}
              ${compData.venue ? ` &nbsp;·&nbsp; ${escHtml(compData.venue)}` : ""}
            </div>
          </div>
          <div style="background:${colour};color:#fff;padding:8px 16px;border-radius:6px;display:flex;align-items:center;gap:10px;white-space:nowrap;align-self:flex-start;">
            <img src="./Logo-mono-white.svg" alt="GymComp" height="16" style="display:block;" />
            <span style="font-size:10px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;">Attendance List</span>
          </div>
        </div>
      </div>
    `;

    // Table
    html += `<table>
      <thead>
        <tr>
          <th style="width:36px;">#</th>
          <th>Gymnast Name</th>
          <th>Club</th>
          <th style="width:60px;text-align:center;">Present ✓</th>
        </tr>
      </thead>
      <tbody>`;

    roundGymnasts.forEach((g, i) => {
      html += `<tr>
        <td>${g.number || i + 1}</td>
        <td>${escHtml(g.name) || "—"}</td>
        <td>${escHtml(g.club) || "—"}</td>
        <td style="text-align:center;"><span class="score-box" style="width:28px;height:20px;"></span></td>
      </tr>`;
    });

    html += `</tbody></table>`;
    html += `</div>`; // close round-page
  });

  html += `<div class="print-footer">
    <span>GymComp · ${compName} · ${compData.date ? formatDate(compData.date) : ""}</span>
    <span>${gymnasts.length} gymnasts registered</span>
  </div>`;

  return html;
}

export function buildDiagnosticHTML(compData, gymnasts, scores) {
  const colour = "#000dff";
  const apparatus = (compData.apparatus || []).filter(a => a !== "Rest");
  const rounds = compData.rounds || [];

  // Score helpers — D/E from flat key suffixes
  const judgeCount = (app) =>
    (compData.judges || []).filter(j => j.apparatus === app).length;

  const sk = (rid, gid, app, sub) => `${gymnast_key(rid, gid, app)}__${sub}`;
  const sv = (rid, gid, app, sub) => parseFloat(scores[sk(rid, gid, app, sub)]) || 0;

  const getDV   = (rid, gid, app) => sv(rid, gid, app, "dv");
  const getBonus= (rid, gid, app) => sv(rid, gid, app, "bon");
  const getEAvg = (rid, gid, app) => {
    const n = Math.max(judgeCount(app), 1);
    let sum = 0, count = 0;
    for (let i = 1; i <= n; i++) {
      const v = sv(rid, gid, app, `e${i}`);
      if (!isNaN(v)) { sum += (10 - v); count++; }
    }
    return count > 0 ? sum / count : 0;
  };
  const getPen  = (rid, gid, app) => sv(rid, gid, app, "pen");
  const getTotal = (roundId, gid, app) => parseFloat(scores[gymnast_key(roundId, gid, app)]) || 0;
  const getOverall = (roundId, gid) => apparatus.reduce((s, a) => s + getTotal(roundId, gid, a), 0);

  // For a gymnast, compute per-apparatus diagnostics vs level peers
  const diagnoseGymnast = (gymnast, round) => {
    const rid = round.id;
    const levelObj = compData.levels.find(l => l.id === gymnast.level);
    const levelName = levelObj?.name || "Unknown";
    const rankBy = levelObj?.rankBy || "level";
    const ageLabel = rankBy === "level+age" ? gymnast.age : null;

    // Peers = same level (and age group if applicable), same round
    const peers = gymnasts.filter(g =>
      g.id !== gymnast.id &&
      g.round === rid &&
      g.level === gymnast.level &&
      (rankBy !== "level+age" || g.age === gymnast.age) &&
      apparatus.some(a => getTotal(rid, g.id, a) > 0)
    );

    const groupLabel = ageLabel ? `${levelName} — ${ageLabel}` : levelName;
    const peerCount = peers.length;

    const appData = apparatus.map(app => {
      const dv     = getDV(rid, gymnast.id, app);
      const bonus  = getBonus(rid, gymnast.id, app);
      const eAvg   = getEAvg(rid, gymnast.id, app);
      const pen    = getPen(rid, gymnast.id, app);
      const total  = getTotal(rid, gymnast.id, app);
      const scored = total > 0;

      const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

      const peerDVs    = peers.map(p => getDV(rid, p.id, app)).filter(v => v > 0);
      const peerBonus  = peers.map(p => getBonus(rid, p.id, app));  // can be 0
      const peerEAvgs  = peers.map(p => getEAvg(rid, p.id, app)).filter(v => v > 0);
      const peerPens   = peers.map(p => getPen(rid, p.id, app));    // can be 0
      const peerTotals = peers.map(p => getTotal(rid, p.id, app)).filter(v => v > 0);

      const avgDV    = avg(peerDVs);
      const avgBonus = peers.length ? avg(peerBonus) : null;
      const avgEAvg  = avg(peerEAvgs);
      const avgPen   = peers.length ? avg(peerPens) : null;
      const avgTotal = avg(peerTotals);

      // Percentile rank among peers+self
      const allTotals = [...peerTotals, total].filter(v => v > 0).sort((a, b) => b - a);
      const rankPos = allTotals.indexOf(total) + 1;
      const pctile = allTotals.length > 1
        ? Math.round(((allTotals.length - rankPos) / (allTotals.length - 1)) * 100)
        : null;

      // Quadrant: DV vs eAvg vs peers
      let quadrant = null, advice = null;
      if (scored && avgDV !== null && avgEAvg !== null) {
        const dvAbove = dv >= avgDV;
        const eAbove  = eAvg >= avgEAvg;
        if (dvAbove && eAbove) {
          quadrant = "strength";
          advice = "Strong on both difficulty value and execution. Focus on consistency and maintaining performance under competition pressure.";
        } else if (dvAbove && !eAbove) {
          quadrant = "refine";
          advice = "Difficulty is competitive but execution deductions are costing marks. Prioritise clean execution — reduce errors on existing skills before adding new ones.";
        } else if (!dvAbove && eAbove) {
          quadrant = "upgrade";
          advice = "Excellent execution — gymnast is performing skills cleanly. Ready to increase difficulty value. Work with coach to add higher-tariff elements.";
        } else {
          quadrant = "develop";
          advice = "Below group average on both difficulty and execution. Focus on foundational skills at lower difficulty first, building clean technique before progression.";
        }
      }

      // Four-dimension deltas
      const fmt = (v, avg) => avg !== null ? parseFloat((v - avg).toFixed(3)) : null;
      const dvDelta    = fmt(dv,    avgDV);
      const bonusDelta = fmt(bonus, avgBonus);
      const eAvgDelta  = fmt(eAvg,  avgEAvg);
      const penDelta   = fmt(pen,   avgPen);   // negative = fewer penalties = good

      // Four-dimension ratings (relative to peers, -2 to +2 scale)
      const rate = (delta, invert) => {
        if (delta === null) return null;
        const d = invert ? -delta : delta;
        if (d >= 0.5) return 2;
        if (d >= 0.1) return 1;
        if (d > -0.1) return 0;
        if (d > -0.5) return -1;
        return -2;
      };
      const dims = {
        dv:    { label: "Difficulty (DV)", val: dv,    avg: avgDV,    delta: dvDelta,    rating: rate(dvDelta, false),    higher: true  },
        bonus: { label: "Bonus",           val: bonus, avg: avgBonus, delta: bonusDelta, rating: rate(bonusDelta, false),  higher: true  },
        exec:  { label: "Execution",       val: eAvg,  avg: avgEAvg,  delta: eAvgDelta,  rating: rate(eAvgDelta, false),   higher: true  },
        pen:   { label: "Penalties",       val: pen,   avg: avgPen,   delta: penDelta,   rating: rate(penDelta, true),     higher: false },
      };

      return { app, dv, bonus, eAvg, pen, total, scored,
        avgDV, avgBonus, avgEAvg, avgPen, avgTotal,
        pctile, quadrant, advice, dims, peerCount };
    });

    const overallTotal = getOverall(rid, gymnast.id);
    const allOveralls = gymnasts
      .filter(g => g.round === rid && g.level === gymnast.level &&
        (rankBy !== "level+age" || g.age === gymnast.age))
      .map(g => getOverall(rid, g.id))
      .filter(v => v > 0)
      .sort((a, b) => b - a);
    const overallRank = allOveralls.indexOf(overallTotal) + 1;
    const overallOf = allOveralls.length;

    return { gymnast, round, levelName, groupLabel, peerCount, appData, overallTotal, overallRank, overallOf };
  };

  const quadrantStyles = {
    strength: { bg: "#e8f8e0", border: "#5cb85c", label: "Strength", icon: "✦" },
    refine:   { bg: "#fff8e0", border: "#f0ad4e", label: "Refine Execution", icon: "⚠" },
    upgrade:  { bg: "#e0f0ff", border: "#5bc0de", label: "Upgrade Difficulty", icon: "↑" },
    develop:  { bg: "#fce8e8", border: "#d9534f", label: "Development Focus", icon: "◎" },
  };

  let html = getPrintHeader(compData, "Gymnast Diagnostic Reports");

  html += `<p style="font-size:11px;color:#666;margin-bottom:20px;line-height:1.6;">
    Diagnostic analysis compares each gymnast's Difficulty Value (DV), Execution, Bonus, and Penalties against level peers
    at this competition. Quadrant placement indicates the primary area for coaching focus.
    ${gymnasts.length} gymnasts across ${(compData.levels||[]).length} levels · ${rounds.length} round(s).
  </p>`;

  // Legend
  html += `<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px;">
    ${Object.entries(quadrantStyles).map(([k, s]) => `
      <div style="display:flex;align-items:center;gap:6px;font-size:10px;">
        <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${s.bg};border:1px solid ${s.border};"></span>
        <strong>${s.icon} ${s.label}</strong>
      </div>`).join("")}
    <span style="font-size:10px;color:#888;margin-left:4px;">· Deltas vs level group average · pctile = percentile rank within group</span>
  </div>`;

  let first = true;
  rounds.forEach(round => {
    const roundGymnasts = gymnasts.filter(g => g.round === round.id &&
      apparatus.some(a => getTotal(round.id, g.id, a) > 0)
    ).sort((a, b) => (a.club || "").localeCompare(b.club || "") || a.name.localeCompare(b.name));

    if (!roundGymnasts.length) return;

    if (!first) html += `<div class="page-break"></div>`;
    first = false;

    html += `<div class="round-header" style="border-left:4px solid ${colour};">
      <span>${escHtml(round.name)} — Diagnostics</span>
      <span class="round-time">${formatTime(round.start)} – ${formatTime(round.end)}</span>
    </div>`;

    roundGymnasts.forEach((gymnast, gi) => {
      const diag = diagnoseGymnast(gymnast, round);
      if (gi > 0 && gi % 3 === 0) html += `<div class="page-break"></div>`;

      const scoredApps = diag.appData.filter(a => a.scored);
      const hasAnalysis = scoredApps.some(a => a.quadrant);

      html += `<div style="border:1px solid #e0e0e0;border-radius:8px;margin-bottom:18px;overflow:hidden;page-break-inside:avoid;">
        <!-- Gymnast header -->
        <div style="background:${colour}18;border-bottom:2px solid ${colour};padding:10px 14px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <span style="font-size:14px;font-weight:800;">${escHtml(gymnast.name)}</span>
            <span style="font-size:11px;color:#555;margin-left:8px;">#${gymnast.number || "—"} · ${escHtml(gymnast.club) || "—"}</span>
          </div>
          <div style="text-align:right;font-size:11px;color:#444;">
            <strong>${escHtml(diag.groupLabel)}</strong><br/>
            ${diag.overallTotal > 0
              ? `Overall: <strong style="color:${colour};">${diag.overallTotal.toFixed(3)}</strong>
                 · Rank <strong>${diag.overallRank}</strong> of ${diag.overallOf}
                 · ${diag.peerCount} peer${diag.peerCount !== 1 ? "s" : ""}`
              : "No scores recorded"}
          </div>
        </div>

        <!-- Per-apparatus table -->
        <table style="margin:0;border-radius:0;">
          <thead>
            <tr style="background:#fafafa;">
              <th style="width:80px;">Apparatus</th>
              <th style="width:42px;text-align:right;">DV</th>
              <th style="width:42px;text-align:right;">Bon</th>
              <th style="width:46px;text-align:right;">eAvg</th>
              <th style="width:42px;text-align:right;">Pen</th>
              <th style="width:54px;text-align:right;">Total</th>
              <th style="width:54px;text-align:right;">AvgTotal</th>
              <th style="width:56px;text-align:right;">Δ Total</th>
              <th style="width:50px;text-align:center;">Pctile</th>
              <th>Quadrant</th>
            </tr>
          </thead>
          <tbody>
            ${diag.appData.map(a => {
              if (!a.scored) return `<tr style="opacity:0.4;">
                <td>${getApparatusIcon(a.app)} ${escHtml(a.app)}</td>
                <td colspan="9" style="color:#aaa;font-size:10px;">DNS</td>
              </tr>`;

              const q = a.quadrant ? quadrantStyles[a.quadrant] : null;
              const fmtD = v => v === null ? "—"
                : `<span style="color:${v >= 0 ? "#5cb85c" : "#d9534f"};font-weight:700;">${v >= 0 ? "+" : ""}${v.toFixed(3)}</span>`;
              const totalDelta = a.avgTotal !== null ? a.total - a.avgTotal : null;

              return `<tr style="${q ? `background:${q.bg};` : ""}">
                <td style="font-weight:600;">${getApparatusIcon(a.app)} ${escHtml(a.app)}</td>
                <td style="text-align:right;">${a.dv > 0 ? a.dv.toFixed(2) : "—"}</td>
                <td style="text-align:right;">${a.bonus > 0 ? a.bonus.toFixed(2) : "—"}</td>
                <td style="text-align:right;">${a.eAvg > 0 ? a.eAvg.toFixed(2) : "—"}</td>
                <td style="text-align:right;${a.pen > 0 ? "color:#d9534f;" : "color:#aaa;"}">${a.pen > 0 ? `−${a.pen.toFixed(2)}` : "—"}</td>
                <td style="text-align:right;font-weight:700;">${a.total.toFixed(3)}</td>
                <td style="text-align:right;color:#777;">${a.avgTotal !== null ? a.avgTotal.toFixed(3) : "—"}</td>
                <td style="text-align:right;">${fmtD(totalDelta)}</td>
                <td style="text-align:center;font-size:10px;">${a.pctile !== null ? `${a.pctile}%` : "—"}</td>
                <td style="font-size:10px;">${q ? `<span style="font-weight:700;color:${q.border};">${q.icon} ${q.label}</span>` : "—"}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>

        ${hasAnalysis ? `
        <!-- Four-dimension breakdown -->
        <div style="padding:10px 14px;background:#fafafa;border-top:1px solid #eee;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#888;margin-bottom:8px;">Component Breakdown vs Peers</div>
          <table style="margin:0;border-radius:0;font-size:10px;">
            <thead>
              <tr style="background:#f0f0f0;">
                <th style="width:80px;">Apparatus</th>
                <th style="text-align:right;">DV</th><th style="text-align:right;color:#777;">Avg</th><th style="text-align:right;">Δ</th>
                <th style="width:8px;"></th>
                <th style="text-align:right;">Bonus</th><th style="text-align:right;color:#777;">Avg</th><th style="text-align:right;">Δ</th>
                <th style="width:8px;"></th>
                <th style="text-align:right;">Exec</th><th style="text-align:right;color:#777;">Avg</th><th style="text-align:right;">Δ</th>
                <th style="width:8px;"></th>
                <th style="text-align:right;">Pen</th><th style="text-align:right;color:#777;">Avg</th><th style="text-align:right;">Δ</th>
              </tr>
            </thead>
            <tbody>
              ${diag.appData.filter(a => a.scored).map(a => {
                const fmtDim = (delta, invert) => {
                  if (delta === null) return `<td style="text-align:right;color:#aaa;">—</td>`;
                  const good = invert ? delta <= 0 : delta >= 0;
                  const neutral = Math.abs(delta) < 0.05;
                  const color = neutral ? "#888" : good ? "#5cb85c" : "#d9534f";
                  const prefix = delta > 0 ? "+" : "";
                  return `<td style="text-align:right;font-weight:700;color:${color};">${prefix}${delta.toFixed(3)}</td>`;
                };
                const fmtVal = v => v > 0 ? v.toFixed(2) : "—";
                const fmtAvg = v => v !== null ? v.toFixed(2) : "—";
                return `<tr>
                  <td style="font-weight:600;">${getApparatusIcon(a.app)} ${escHtml(a.app)}</td>
                  <td style="text-align:right;">${fmtVal(a.dv)}</td>
                  <td style="text-align:right;color:#777;">${fmtAvg(a.avgDV)}</td>
                  ${fmtDim(a.dims.dv.delta, false)}
                  <td></td>
                  <td style="text-align:right;">${fmtVal(a.bonus)}</td>
                  <td style="text-align:right;color:#777;">${fmtAvg(a.avgBonus)}</td>
                  ${fmtDim(a.dims.bonus.delta, false)}
                  <td></td>
                  <td style="text-align:right;">${fmtVal(a.eAvg)}</td>
                  <td style="text-align:right;color:#777;">${fmtAvg(a.avgEAvg)}</td>
                  ${fmtDim(a.dims.exec.delta, false)}
                  <td></td>
                  <td style="text-align:right;${a.pen > 0 ? "color:#d9534f;" : "color:#aaa;"}">${a.pen > 0 ? a.pen.toFixed(2) : "—"}</td>
                  <td style="text-align:right;color:#777;">${fmtAvg(a.avgPen)}</td>
                  ${fmtDim(a.dims.pen.delta, true)}
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>

        <!-- Coaching notes -->
        <div style="padding:10px 14px;background:#fafafa;border-top:1px solid #eee;">
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:#888;margin-bottom:6px;">Coaching Notes</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            ${diag.appData.filter(a => a.scored && a.advice).map(a => {
              const q = quadrantStyles[a.quadrant];
              return `<div style="flex:1;min-width:180px;border-left:3px solid ${q.border};padding:6px 10px;background:${q.bg};border-radius:0 4px 4px 0;">
                <div style="font-size:10px;font-weight:700;margin-bottom:3px;">${getApparatusIcon(a.app)} ${escHtml(a.app)}</div>
                <div style="font-size:10px;line-height:1.5;color:#333;">${a.advice}</div>
              </div>`;
            }).join("")}
          </div>
        </div>` : ""}
      </div>`;
    });
  });

  html += `<div class="print-footer">
    <span>GymComp · Gymnast Diagnostic Report · Generated ${new Date().toLocaleDateString("en-GB")}</span>
    <span>${escHtml(compData.organiserName) || ""}</span>
  </div>`;

  return html;
}

export function buildResultsHTML(compData, gymnasts, scores) {
  const colour = "#000dff";
  const apparatus = (compData.apparatus || []).filter(a => a !== "Rest");
  const rounds = compData.rounds || [];

  const getScore = (roundId, gid, app) => {
    const v = parseFloat(scores[gymnast_key(roundId, gid, app)]);
    return isNaN(v) ? 0 : v;
  };
  const getTotal = (roundId, gid) =>
    apparatus.reduce((s, a) => s + getScore(roundId, gid, a), 0);

  const buildRankGroups = (roundId) => {
    const roundGymnasts = gymnasts.filter(g => g.round === roundId);
    const map = {};
    roundGymnasts.forEach(g => {
      const levelObj = compData.levels.find(l => l.id === g.level);
      const levelName = levelObj?.name || "Unknown";
      const rankBy = levelObj?.rankBy || "level";
      const ageLabel = rankBy === "level+age" ? (g.age || "Unknown age") : "";
      const key = `${levelName}|||${ageLabel}`;
      if (!map[key]) map[key] = { levelName, ageLabel, gymnasts: [] };
      map[key].gymnasts.push(g);
    });
    const levelOrder = (compData.levels || []).map(l => l.name);
    return Object.entries(map)
      .sort(([a], [b]) => {
        const aLevel = a.split("|||")[0];
        const bLevel = b.split("|||")[0];
        const ai = levelOrder.indexOf(aLevel);
        const bi = levelOrder.indexOf(bLevel);
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) || a.localeCompare(b);
      })
      .map(([key, val]) => ({ key, ...val }));
  };

  const badgeCell = (rank) => {
    if (rank === null) return `<td><span style="font-size:10px;color:#aaa;">DNS</span></td>`;
    const medals = {
      1: { text: "🥇 1st", bg: "#fff7d6", border: "#d4a800" },
      2: { text: "🥈 2nd", bg: "#f2f2f2", border: "#999" },
      3: { text: "🥉 3rd", bg: "#fdf0e8", border: "#c87028" },
    };
    const m = medals[rank] || { text: `${rank}th`, bg: "#f5f5f5", border: "#ccc" };
    return `<td><span style="display:inline-block;padding:2px 8px;border-radius:3px;font-size:10px;font-weight:700;background:${m.bg};border:1px solid ${m.border};">${m.text}</span></td>`;
  };

  const totalWithScores = gymnasts.filter(g =>
    apparatus.some(a => getScore(g.round, g.id, a) > 0)
  ).length;

  let html = getPrintHeader(compData, "Official Results");

  // Summary panel
  html += `<div style="display:flex;gap:16px;margin-bottom:20px;flex-wrap:wrap;">
    ${[
      [gymnasts.length, "Gymnasts"],
      [(compData.levels || []).length, "Levels"],
      [rounds.length, "Rounds"],
      [apparatus.length, "Apparatus"],
      [totalWithScores, "Scored"],
    ].map(([n, label]) => `
      <div style="background:#f5f5f5;border-radius:6px;padding:10px 16px;text-align:center;">
        <div style="font-size:20px;font-weight:800;color:${colour};">${n}</div>
        <div style="font-size:9px;text-transform:uppercase;letter-spacing:0.8px;color:#666;">${label}</div>
      </div>`).join("")}
  </div>`;

  // Section 1: Overall results per round
  rounds.forEach((round, ri) => {
    if (ri > 0) html += `<div class="page-break"></div>`;
    html += `<div class="round-header" style="border-left:4px solid ${colour};">
      <span>${escHtml(round.name)} — Overall Results</span>
      <span class="round-time">${formatTime(round.start)} – ${formatTime(round.end)}</span>
    </div>`;

    const rankGroups = buildRankGroups(round.id);
    if (!rankGroups.length) {
      html += `<p style="color:#999;font-size:10px;padding:8px 0;">No gymnasts in this round.</p>`;
    } else {
      rankGroups.forEach(({ levelName, ageLabel, gymnasts: glist }) => {
        const groupLabel = ageLabel ? `${levelName} — ${ageLabel}` : levelName;
        const withTotals = glist.map(g => ({ ...g, total: getTotal(round.id, g.id) }));
        const ranked = denseRank(withTotals.filter(g => g.total > 0), "total");
        const dns = withTotals.filter(g => g.total === 0);

        html += `<h2 style="border-left:3px solid ${colour};padding-left:8px;">${escHtml(groupLabel)}</h2>
        <table style="margin-bottom:18px;">
          <thead><tr>
            <th style="width:60px;">Rank</th>
            <th style="width:32px;">#</th>
            <th>Gymnast</th><th>Club</th>
            ${apparatus.map(a => `<th style="width:64px;text-align:right;">${escHtml(a)}</th>`).join("")}
            <th style="width:70px;text-align:right;">Total</th>
          </tr></thead>
          <tbody>
          ${ranked.map(g => `<tr>
            ${badgeCell(g.rank)}
            <td style="color:#888;">${g.number || ""}</td>
            <td><strong>${escHtml(g.name)}</strong></td>
            <td style="color:#666;">${escHtml(g.club) || ""}</td>
            ${apparatus.map(a => {
              const s = getScore(round.id, g.id, a);
              return `<td style="text-align:right;color:#555;">${s > 0 ? s.toFixed(3) : "—"}</td>`;
            }).join("")}
            <td style="text-align:right;font-weight:800;color:${colour};">${g.total.toFixed(3)}</td>
          </tr>`).join("")}
          ${dns.map(g => `<tr style="opacity:0.4;">
            <td style="color:#aaa;font-size:10px;">DNS</td>
            <td style="color:#aaa;">${g.number || ""}</td>
            <td>${escHtml(g.name)}</td>
            <td style="color:#aaa;">${escHtml(g.club) || ""}</td>
            ${apparatus.map(() => `<td style="text-align:right;color:#aaa;">—</td>`).join("")}
            <td style="text-align:right;color:#aaa;">—</td>
          </tr>`).join("")}
          </tbody>
        </table>`;
      });
    }
  });

  // Section 2: Per-apparatus breakdown per round
  rounds.forEach((round) => {
    html += `<div class="page-break"></div>`;
    html += getPrintHeader(compData, `${escHtml(round.name)} — By Apparatus`);

    const rankGroups = buildRankGroups(round.id);
    apparatus.forEach((app, ai) => {
      if (ai > 0) html += `<div style="margin-top:18px;border-top:1px solid #eee;padding-top:14px;"></div>`;
      html += `<h2 style="border-left:3px solid ${colour};padding-left:8px;">${getApparatusIcon(app)} ${escHtml(app)}</h2>`;

      rankGroups.forEach(({ levelName, ageLabel, gymnasts: glist }) => {
        const groupLabel = ageLabel ? `${levelName} — ${ageLabel}` : levelName;
        const withScores = glist.map(g => ({ ...g, score: getScore(round.id, g.id, app) }));
        const ranked = denseRank(withScores.filter(g => g.score > 0), "score");
        const dns = withScores.filter(g => g.score === 0);

        html += `<h3 style="color:#444;margin-top:10px;">${escHtml(groupLabel)} <span style="font-weight:400;color:#888;">(${glist.length})</span></h3>
        <table style="margin-bottom:14px;">
          <thead><tr>
            <th style="width:60px;">Rank</th>
            <th style="width:32px;">#</th>
            <th>Gymnast</th><th>Club</th>
            <th style="width:80px;text-align:right;">Score</th>
          </tr></thead>
          <tbody>
          ${ranked.map(g => `<tr>
            ${badgeCell(g.rank)}
            <td style="color:#888;">${g.number || ""}</td>
            <td>${escHtml(g.name)}</td>
            <td style="color:#666;">${escHtml(g.club) || ""}</td>
            <td style="text-align:right;font-weight:700;color:${colour};">${g.score.toFixed(3)}</td>
          </tr>`).join("")}
          ${dns.map(g => `<tr style="opacity:0.4;">
            <td style="color:#aaa;font-size:10px;">DNS</td>
            <td style="color:#aaa;">${g.number || ""}</td>
            <td>${escHtml(g.name)}</td>
            <td style="color:#aaa;">${escHtml(g.club) || ""}</td>
            <td style="text-align:right;color:#aaa;">—</td>
          </tr>`).join("")}
          </tbody>
        </table>`;
      });
    });
  });

  html += `<div class="print-footer">
    <span>GymComp · Official Results · Generated ${new Date().toLocaleDateString("en-GB")}</span>
    <span>${escHtml(compData.organiserName) || ""}</span>
  </div>`;

  return html;
}

export function exportResultsPDF(compData, gymnasts, scores) {
  const getPlainIcon = () => "";
  const apparatus = (compData.apparatus || []).filter(a => a !== "Rest");

  const getScore = (roundId, gid, app) => {
    const v = parseFloat(scores[`${roundId}__${gid}__${app}`]);
    return isNaN(v) ? 0 : v;
  };
  const getTotal = (roundId, gid) => apparatus.reduce((s, a) => s + getScore(roundId, gid, a), 0);

  const denseRankLocal = (items, key) => {
    const sorted = [...items].sort((a, b) => b[key] - a[key]);
    const result = [];
    let rank = 1;
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i][key] < sorted[i - 1][key]) rank = i + 1;
      result.push({ ...sorted[i], rank });
    }
    return result;
  };

  const medalEmoji = (rank) => rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}th`;

  let body = "";

  compData.rounds.forEach(round => {
    const roundGymnasts = gymnasts.filter(g => g.round === round.id);
    const map = {};
    roundGymnasts.forEach(g => {
      const levelObj = compData.levels.find(l => l.id === g.level);
      const levelName = levelObj?.name || "Unknown";
      const rankBy = levelObj?.rankBy || "level";
      const ageLabel = rankBy === "level+age" ? (g.age || "") : "";
      const key = `${levelName}|||${ageLabel}`;
      if (!map[key]) map[key] = { levelName, ageLabel, gymnasts: [] };
      map[key].gymnasts.push(g);
    });

    body += `<div class="round-header">${escHtml(round.name)} &nbsp;·&nbsp; ${round.start} – ${round.end}</div>`;

    Object.values(map).sort((a,b)=>(a.levelName+a.ageLabel).localeCompare(b.levelName+b.ageLabel)).forEach(({ levelName, ageLabel, gymnasts: glist }) => {
      const label = ageLabel ? `${levelName} — ${ageLabel}` : levelName;
      body += `<div class="level-header">${escHtml(label)}</div>`;

      // Overall ranking table
      const withTotals = glist.map(g => ({ ...g, total: getTotal(round.id, g.id) }));
      const ranked = denseRankLocal(withTotals.filter(g => g.total > 0), "total");
      const dns = withTotals.filter(g => g.total === 0);

      const appHeaders = apparatus.map(a => `<th>${getPlainIcon(a)} ${escHtml(a)}</th>`).join("");

      body += `<table><thead><tr><th>Rank</th><th>#</th><th>Gymnast</th><th>Club</th>${appHeaders}<th>Total</th></tr></thead><tbody>`;
      [...ranked, ...dns.map(g=>({...g,rank:null}))].forEach(g => {
        const cells = apparatus.map(a => `<td>${getScore(round.id, g.id, a) > 0 ? getScore(round.id, g.id, a).toFixed(3) : "—"}</td>`).join("");
        const rankCell = g.rank === null ? `<td class="dns">DNS</td>` : `<td class="rank">${medalEmoji(g.rank)}</td>`;
        body += `<tr class="${g.rank === null ? "dns-row" : ""}">${rankCell}<td>${g.number || ""}</td><td><strong>${escHtml(g.name)}</strong></td><td>${escHtml(g.club) || ""}</td>${cells}<td><strong>${g.total > 0 ? g.total.toFixed(3) : "—"}</strong></td></tr>`;
      });
      body += `</tbody></table>`;
    });
  });

  const dateFmt = compData.date
    ? new Date(compData.date + "T12:00:00").toLocaleDateString("en-GB", { weekday:"long", year:"numeric", month:"long", day:"numeric" })
    : "";

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${escHtml(compData.name) || "Competition"} — Results</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Arial', sans-serif; font-size: 11px; color: #111; padding: 20px; }
  .header { text-align: center; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 2px solid #111; }
  .header h1 { font-size: 26px; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 4px; }
  .header .meta { font-size: 11px; color: #555; }
  .round-header { font-size: 15px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin: 20px 0 8px; padding: 6px 10px; background: #111; color: #fff; border-radius: 4px; }
  .level-header { font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; color: #555; margin: 14px 0 6px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 10.5px; }
  th { background: #f0f0f0; padding: 6px 8px; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.8px; border: 1px solid #ddd; }
  td { padding: 6px 8px; border: 1px solid #ddd; }
  .rank { font-weight: bold; }
  .dns { color: #999; font-style: italic; }
  .dns-row td { color: #999; }
  tr:nth-child(even) td { background: #fafafa; }
  .footer { margin-top: 20px; text-align: center; font-size: 9px; color: #aaa; border-top: 1px solid #ddd; padding-top: 10px; }
  @media print { body { padding: 10px; } .round-header { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head><body>
<div class="header">
  <h1>${escHtml(compData.name) || "Competition Results"}</h1>
  <div class="meta">${[dateFmt, escHtml(compData.location), compData.holder ? `Holder: ${escHtml(compData.holder)}` : ""].filter(Boolean).join("  ·  ")}</div>
</div>
${body}
<div class="footer">Generated by GYMCOMP · ${new Date().toLocaleDateString("en-GB")}</div>
</body></html>`;

  generatePDF(html, "gymcomp-results.pdf");
}

export function exportResultsXLSX(compData, gymnasts, scores) {
  const apparatus = (compData.apparatus || []).filter(a => a !== "Rest");
  const getScore = (roundId, gid, app) => {
    const v = parseFloat(scores[`${roundId}__${gid}__${app}`]);
    return isNaN(v) ? 0 : v;
  };
  const getTotal = (roundId, gid) => apparatus.reduce((s, a) => s + getScore(roundId, gid, a), 0);
  const denseRankLocal = (items, key) => {
    const sorted = [...items].sort((a, b) => b[key] - a[key]);
    const result = [];
    let rank = 1;
    for (let i = 0; i < sorted.length; i++) {
      if (i > 0 && sorted[i][key] < sorted[i - 1][key]) rank = i + 1;
      result.push({ ...sorted[i], rank });
    }
    return result;
  };

  const fig = true;
  const judgeCount = (app) => (compData.judges || []).filter(j => j.apparatus === app).length;

  // ── Sheet 1: Results ──
  const resultsRows = [];
  resultsRows.push([compData.name || "Competition Results"]);
  const dateFmt = compData.date
    ? new Date(compData.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    : "";
  resultsRows.push([[dateFmt, compData.location, compData.holder].filter(Boolean).join("  ·  ")]);
  resultsRows.push([]);

  compData.rounds.forEach(round => {
    const roundGymnasts = gymnasts.filter(g => g.round === round.id);
    const map = {};
    roundGymnasts.forEach(g => {
      const levelObj = compData.levels.find(l => l.id === g.level);
      const levelName = levelObj?.name || "Unknown";
      const rankBy = levelObj?.rankBy || "level";
      const ageLabel = rankBy === "level+age" ? (g.age || "") : "";
      const key = `${levelName}|||${ageLabel}`;
      if (!map[key]) map[key] = { levelName, ageLabel, gymnasts: [] };
      map[key].gymnasts.push(g);
    });

    resultsRows.push([`${round.name}  ·  ${round.start} – ${round.end}`]);
    const appHeaders = apparatus;
    const header = ["Position", "#", "Gymnast", "Club", "Age Category", ...appHeaders, "Total"];
    resultsRows.push(header);

    Object.values(map).sort((a, b) => (a.levelName + a.ageLabel).localeCompare(b.levelName + b.ageLabel)).forEach(({ levelName, ageLabel, gymnasts: glist }) => {
      const label = ageLabel ? `${levelName} — ${ageLabel}` : levelName;
      resultsRows.push([label]);

      const withTotals = glist.map(g => ({ ...g, total: getTotal(round.id, g.id) }));
      const ranked = denseRankLocal(withTotals.filter(g => g.total > 0), "total");
      const dns = withTotals.filter(g => g.total === 0);

      [...ranked, ...dns.map(g => ({ ...g, rank: null }))].forEach(g => {
        const appScores = apparatus.map(a => {
          const s = getScore(round.id, g.id, a);
          return s > 0 ? parseFloat(s.toFixed(3)) : "";
        });
        resultsRows.push([
          g.rank === null ? "DNS" : g.rank,
          g.number || "",
          g.name,
          g.club || "",
          ageLabel || "",
          ...appScores,
          g.total > 0 ? parseFloat(g.total.toFixed(3)) : ""
        ]);
      });
      resultsRows.push([]);
    });
  });

  // ── Sheet 2: Raw Scores ──
  const rawRows = [];
  const maxJudges = fig ? Math.max(1, ...apparatus.map(a => judgeCount(a))) : 0;
  const rawHeader = ["#", "Gymnast", "Round", "Apparatus"];
  if (fig) {
    rawHeader.push("D Score");
    for (let i = 1; i <= maxJudges; i++) rawHeader.push(`E Judge ${i}`);
    rawHeader.push("Avg E", "Bonus", "Penalty");
  }
  rawHeader.push("Final Score");
  rawRows.push(rawHeader);

  compData.rounds.forEach(round => {
    const roundGymnasts = gymnasts.filter(g => g.round === round.id);
    roundGymnasts.sort((a, b) => (a.number || "").localeCompare(b.number || "", undefined, { numeric: true }));
    roundGymnasts.forEach(g => {
      apparatus.forEach(app => {
        const finalScore = getScore(round.id, g.id, app);
        if (finalScore === 0 && !fig) return;
        const bk = `${round.id}__${g.id}__${app}`;
        const isDual = scores[`${bk}__dualVault`] === "1";
        const row = [g.number || "", g.name, round.name, app];
        if (fig) {
          if (isDual) {
            // Dual vault: output V1 Final, V2 Final, then pad remaining columns, then Average
            const v1fin = parseFloat(scores[`${bk}__v1fin`]) || 0;
            const v2fin = parseFloat(scores[`${bk}__v2fin`]) || 0;
            row.push(v1fin > 0 ? v1fin : ""); // D Score column → V1 Final
            for (let i = 1; i <= maxJudges; i++) {
              if (i === 1) row.push(v2fin > 0 ? v2fin : ""); // First E Judge column → V2 Final
              else row.push("");
            }
            row.push("", "", ""); // Avg E, Bonus, Penalty blank for dual vault
          } else {
            const dv = parseFloat(scores[`${bk}__dv`]) || 0;
            row.push(dv || "");
            const n = judgeCount(app);
            let eSum = 0, eCount = 0;
            for (let i = 1; i <= maxJudges; i++) {
              if (i <= Math.max(n, 1)) {
                const v = parseFloat(scores[`${bk}__e${i}`]);
                if (!isNaN(v)) { eSum += (10 - v); eCount++; row.push(v); }
                else row.push("");
              } else {
                row.push("");
              }
            }
            const eAvg = eCount > 0 ? parseFloat((eSum / eCount).toFixed(3)) : "";
            const bon = parseFloat(scores[`${bk}__bon`]) || "";
            const pen = parseFloat(scores[`${bk}__pen`]) || "";
            row.push(eAvg, bon, pen);
          }
        }
        row.push(finalScore > 0 ? parseFloat(finalScore.toFixed(3)) : "");
        rawRows.push(row);
      });
    });
  });

  // ── Build workbook ──
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.aoa_to_sheet(resultsRows);
  const ws2 = XLSX.utils.aoa_to_sheet(rawRows);
  XLSX.utils.book_append_sheet(wb, ws1, "Results");
  XLSX.utils.book_append_sheet(wb, ws2, "Raw Scores");

  const filename = `${(compData.name || "competition").replace(/[^a-zA-Z0-9]/g, "_")}_results.xlsx`;
  XLSX.writeFile(wb, filename);
}
