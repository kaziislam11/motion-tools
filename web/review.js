'use strict';
window.MotionReview = { initialize(deps) {
  const { api, status, currentAsset, target, targetOrNone, settings, studioAction, watchDraft } = deps;
  const $ = id => document.getElementById(id);
  let current = null, selectedAsset = '', epoch = 0, readTicket = 0, loading = false, playback = 0, lastRevision = '', pending = null;
  const node = (tag, text, className) => { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; if (className) element.className = className; return element; };
  function stopSamples() { if (playback) cancelAnimationFrame(playback); playback = 0; $('playSamples').textContent = 'Play samples'; }
  function draw() {
    if (!current?.telemetry) return;
    const telemetry = current.telemetry, index = Number($('sampleTime').value), frame = telemetry.samples[index];
    if (!frame) return;
    $('sampleLabel').textContent = `${frame.time.toFixed(3)} seconds · ${frame.id} · ${index + 1} / ${telemetry.samples.length} poses`;
    for (const [id, axis] of [['poseFront', 0], ['poseSide', 2]]) {
      const canvas = $(id), ctx = canvas.getContext('2d');
      let minX = Infinity, maxX = -Infinity, minY = 0, maxY = 0;
      for (const sample of telemetry.samples) for (const point of sample.points) {
        minX = Math.min(minX, point[axis]); maxX = Math.max(maxX, point[axis]); minY = Math.min(minY, point[1]); maxY = Math.max(maxY, point[1]);
      }
      const scale = Math.min((canvas.width - 70) / Math.max(1, maxX - minX), (canvas.height - 70) / Math.max(1, maxY - minY));
      const project = point => [canvas.width / 2 + (point[axis] - (minX + maxX) / 2) * scale * (axis === 2 ? -1 : 1), canvas.height - 35 - (point[1] - minY) * scale];
      ctx.fillStyle = '#f8faf5'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      const ground = canvas.height - 35 + minY * scale;
      ctx.strokeStyle = '#b9c5b5'; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(12, ground); ctx.lineTo(canvas.width - 12, ground); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#657563'; ctx.font = '11px Segoe UI'; ctx.fillText('estimated rest ground', 12, Math.min(canvas.height - 8, ground + 18));
      const points = frame.points.map(project);
      for (let n = 0; n < telemetry.nodes.length; n++) {
        const item = telemetry.nodes[n], point = points[n];
        if (item.parent) { const parent = points[item.parent - 1]; ctx.strokeStyle = '#365b46'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(...parent); ctx.lineTo(...point); ctx.stroke(); }
        ctx.fillStyle = item.foot ? '#af4f2c' : item.driven ? '#466d52' : '#909a8f'; ctx.beginPath(); ctx.arc(...point, item.foot ? 5 : 3.5, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  function sampleLinks(ids) {
    const group = node('span', undefined, 'sampleLinks');
    for (const id of [...new Set(ids)].slice(0, 8)) {
      const index = current?.telemetry?.samples.findIndex(sample => sample.id === id) ?? -1;
      if (index < 0) { group.append(node('span', id)); continue; }
      const button = node('button', `${current.telemetry.samples[index].time.toFixed(2)}s`, 'quiet'); button.type = 'button';
      button.addEventListener('click', () => { stopSamples(); $('sampleTime').value = String(index); draw(); }); group.append(button);
    }
    return group;
  }
  function render() {
    if (!current || current.assetId !== selectedAsset) return;
    const key = `${current.id}/${current.revision}`; if (lastRevision === key) return; lastRevision = key;
    stopSamples(); $('reviewContent').hidden = false;
    const busy = ['inspecting', 'critiquing', 'revising'].includes(current.status);
    const editable = !busy && current.status !== 'accepted' && !current.childAssetId;
    const source = current.telemetry ? `${current.telemetry.samples.length} actual Studio poses` : 'Recipe-only inspection';
    let message = `${current.assetName} · ${source}\n`;
    message += current.status === 'inspecting' ? 'Inspecting the animation in Studio...' : current.status === 'critiquing' ? 'Your AI is reviewing the evidence. One API call is running...' : current.status === 'accepted' ? 'You accepted this version.' : current.status === 'revising' ? 'Creating a revision from your saved feedback...' : current.childAssetId ? 'Your feedback produced a new version. Choose that version in the library to review it.' : current.status === 'changes_requested' ? 'Feedback saved. Make the requested changes when you are ready.' : 'Watch the Studio preview, then answer below.';
    if (current.preview?.status === 'not_confirmed') message += '\nStudio did not confirm preview playback. Use Preview selected and watch the result before giving feedback.';
    if (current.error) message += `\n${current.error}`;
    status('reviewStatus', message, Boolean(current.error));
    $('poseViewer').hidden = !current.telemetry;
    if (current.telemetry) { $('sampleTime').max = String(current.telemetry.samples.length - 1); $('sampleTime').value = '0'; draw(); }
    $('motionFindings').replaceChildren(...current.report.findings.map(finding => {
      const entry = node('article', undefined, `finding ${finding.severity}`); entry.append(node('h3', finding.title), node('p', finding.detail), sampleLinks(finding.sampleIds)); return entry;
    }));
    const table = node('table');
    for (const metric of current.report.metrics) {
      const row = node('tr'), value = node('td', `${metric.value} ${metric.unit}`); value.title = metric.detail;
      row.append(node('th', metric.label), value); table.append(row);
    }
    $('motionMetrics').replaceChildren(table);
    $('inspectionLimits').replaceChildren(...current.report.limitations.map(text => node('li', text)));
    $('aiFindings').replaceChildren();
    if (current.critique) {
      $('aiFindings').append(node('h3', current.critique.source === 'pose_data' ? 'AI review of pose data' : 'AI review with attached images'), node('p', current.critique.summary));
      for (const finding of current.critique.findings) {
        const entry = node('article', undefined, 'finding'); entry.append(node('p', finding.observation), node('p', `Suggestion: ${finding.suggestion}`), sampleLinks(finding.evidenceIds)); $('aiFindings').append(entry);
      }
      $('aiFindings').append(node('p', `${current.critique.model} · ${current.critique.usage.inputTokens} input / ${current.critique.usage.outputTokens} output tokens. AI suggestions are not acceptance.`, 'small'));
    }
    const questions = current.questions || current.report.questions;
    $('reviewQuestions').replaceChildren(...questions.map((question, index) => {
      const wrapper = node('div'), label = node('label', question.question), input = node('input'); input.id = `answer-${index}`; input.maxLength = 2000; input.dataset.questionId = question.id; label.htmlFor = input.id;
      input.value = current.feedback?.answers.find(a => a.questionId === question.id)?.answer || '';
      wrapper.append(label, input);
      if (question.choices?.length) {
        const list = node('datalist'); list.id = `choices-${index}`; for (const choice of question.choices) { const option = node('option'); option.value = choice; list.append(option); }
        input.setAttribute('list', list.id); input.placeholder = 'Choose a suggestion or type your answer'; wrapper.append(list);
      }
      return wrapper;
    }));
    for (const radio of document.querySelectorAll('input[name="overall"]')) radio.checked = current.feedback?.overall === radio.value;
    $('liked').value = current.feedback?.liked || ''; $('changes').value = current.feedback?.changes || ''; $('watchedPreview').checked = Boolean(current.feedback?.watchedPreview);
    for (const control of $('feedbackForm').elements) control.disabled = !editable;
    $('reviseFeedback').disabled = current.status !== 'changes_requested' || Boolean(current.childAssetId);
    $('attachEvidence').disabled = !editable || current.images.length >= 4;
    $('critique').disabled = !editable || (!current.telemetry && !current.images.length);
    $('previewParent').disabled = !current.parentAssetId;
    $('evidenceList').replaceChildren(...current.images.map(image => node('p', `${image.view}${image.time !== undefined ? ` at ${image.time}s` : ''} · ${image.width} × ${image.height} · ${image.id.slice(0, 8)}`, 'small')));
    status('feedbackStatus', current.feedback ? `Saved for this exact asset version. ${current.feedback.source === 'client_reported_user' ? 'Feedback reported by your MCP client.' : 'Feedback entered in this panel.'}` : 'Keep/change notes and answers are preserved with this version.');
    updateButtons();
  }
  function updateButtons() {
    const busy = loading || ['inspecting', 'critiquing', 'revising'].includes(current?.status);
    const editable = current && !busy && current.status !== 'accepted' && !current.childAssetId;
    $('inspect').disabled = busy;
    $('cancelReview').disabled = !['inspecting', 'critiquing'].includes(current?.status);
    $('attachEvidence').disabled = !editable || current.images.length >= 4;
    $('critique').disabled = !editable || (!current.telemetry && !current.images.length);
    $('reviseFeedback').disabled = busy || current?.status !== 'changes_requested' || Boolean(current?.childAssetId);
    $('previewParent').disabled = loading || !current?.parentAssetId;
  }
  async function load(id) {
    const requestEpoch = epoch, ticket = ++readTicket;
    const review = await api('review', { id });
    if (requestEpoch !== epoch || ticket !== readTicket || review.assetId !== selectedAsset) return;
    current = review; render();
    if (['inspecting', 'critiquing', 'revising'].includes(review.status)) {
      clearTimeout(pending); pending = setTimeout(() => load(id).catch(error => status('reviewStatus', error.message, true)), 1000);
    }
  }
  async function assetChanged(id) {
    if (id === selectedAsset) return;
    selectedAsset = id || ''; epoch++; current = null; lastRevision = ''; stopSamples(); clearTimeout(pending); $('reviewContent').hidden = true;
    updateButtons();
    status('reviewStatus', id ? 'Loading this version’s review...' : 'Select an asset to inspect.');
    if (!id) return;
    const requestEpoch = epoch, ticket = ++readTicket;
    try {
      const review = await api('review-latest', { id }); if (requestEpoch !== epoch || ticket !== readTicket) return;
      if (review) { current = review; render(); if (['inspecting', 'critiquing', 'revising'].includes(review.status)) await load(review.id); }
      else status('reviewStatus', 'This version has no inspection yet. Click Inspect & ask me.');
    } catch (error) { if (requestEpoch === epoch) status('reviewStatus', error.message, true); }
  }
  function action(id, handler) {
    $(id).addEventListener('click', async () => {
      if (loading) return; loading = true; $(id).disabled = true;
      try { await handler(); } catch (error) { status('reviewStatus', error.message, true); }
      finally { loading = false; updateButtons(); }
    });
  }
  action('inspect', async () => {
    const asset = currentAsset(); if (!asset) throw new Error('Choose a library version first.');
    const review = await api('inspect', { assetId: asset.id, ...targetOrNone(), motionMode: $('motionMode').value, aiReview: settings().aiReview, provider: settings().provider });
    await load(review.id);
  });
  action('critique', async () => {
    if (!current) throw new Error('Inspect this version first.');
    const review = await api('review-critique', { reviewId: current.id, revision: current.revision, provider: settings().provider, ...($('reviewModel').value.trim() ? { model: $('reviewModel').value.trim() } : {}) });
    await load(review.id);
  });
  action('cancelReview', async () => { if (current) { await api('review-cancel', { id: current.id }); await load(current.id); } });
  action('previewParent', async () => {
    if (!current?.parentAssetId) throw new Error('This version has no parent.');
    await studioAction('preview', { ...target(), assetId: current.parentAssetId, seconds: Number($('seconds').value), part: $('part').value });
  });
  action('attachEvidence', async () => {
    if (!current) throw new Error('Inspect this version first.');
    const record = current, requestEpoch = epoch, view = $('evidenceView').value, time = $('evidenceTime').value;
    const file = $('evidenceFile').files[0]; if (!file) throw new Error('Choose a screenshot first.');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 12_000_000) throw new Error('Choose a PNG, JPEG, or WebP screenshot under 12 MB.');
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas'), scale = Math.min(1, 960 / Math.max(bitmap.width, bitmap.height));
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    const pngBase64 = canvas.toDataURL('image/png').split(',')[1];
    if (requestEpoch !== epoch) throw new Error('Selected version changed while loading the screenshot. Choose the correct version and attach again.');
    const review = await api('review-image', { reviewId: record.id, revision: record.revision, pngBase64, view, ...(time !== '' ? { time: Number(time) } : {}) });
    $('evidenceFile').value = ''; await load(review.id);
  });
  $('feedbackForm').addEventListener('submit', async event => {
    event.preventDefault(); if (!current || loading) return; loading = true; $('saveFeedback').disabled = true;
    try {
      const overall = $('feedbackForm').querySelector('input[name="overall"]:checked')?.value;
      const answers = [...$('reviewQuestions').querySelectorAll('input[data-question-id]')].filter(input => input.value.trim()).map(input => ({ questionId: input.dataset.questionId, answer: input.value.trim() }));
      const review = await api('review-feedback', { reviewId: current.id, revision: current.revision, feedback: { overall, watchedPreview: $('watchedPreview').checked, liked: $('liked').value, changes: $('changes').value, answers } });
      await load(review.id);
    } catch (error) { status('feedbackStatus', error.message, true); }
    finally { loading = false; $('saveFeedback').disabled = current?.status === 'accepted' || Boolean(current?.childAssetId); updateButtons(); }
  });
  action('reviseFeedback', async () => {
    if (!current) throw new Error('Record feedback first.');
    const job = await api('review-revise', { reviewId: current.id, revision: current.revision, ...settings(), ...targetOrNone() });
    await load(current.id); await watchDraft(job.id);
  });
  $('sampleTime').addEventListener('input', () => { stopSamples(); draw(); });
  $('playSamples').addEventListener('click', () => {
    if (playback) { stopSamples(); return; } if (!current?.telemetry) return;
    const telemetry = current.telemetry, started = performance.now(); $('playSamples').textContent = 'Pause samples';
    const tick = now => {
      const elapsed = (now - started) / 1000, time = telemetry.loop ? elapsed % telemetry.duration : Math.min(elapsed, telemetry.duration);
      let index = telemetry.samples.findIndex(sample => sample.time >= time); if (index < 0) index = telemetry.samples.length - 1;
      $('sampleTime').value = String(index); draw();
      if (!telemetry.loop && elapsed >= telemetry.duration) stopSamples(); else playback = requestAnimationFrame(tick);
    };
    playback = requestAnimationFrame(tick);
  });
  return { assetChanged, load };
} };
