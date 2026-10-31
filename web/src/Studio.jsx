import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronRight, Circle, CircleCheck, CircleHelp, Clapperboard, Clock3, Database, FileJson, Film, Grid2X2, LoaderCircle, Maximize2, Package, Play, Plus, ShieldCheck, Store, Type, Upload, Users, Workflow, X } from 'lucide-react';
import { Button, Empty, Json, Modal } from './components/ui.jsx';
import { request, uploadVideo } from './lib/api.js';
import { contextFrom, metric, platformNames, stepState, timeLabel } from './lib/state.js';

const rail = [['video', Film, 'Video'], ['caption', Type, 'Tiêu đề'], ['product', Package, 'Sản phẩm'], ['audience', Users, 'Audience'], ['platform', Grid2X2, 'Nền tảng']];
const groupNames = ['Viral', 'Conversion', 'SKU & thị trường'];
const statusLabels = { ok: 'Xong', skipped: 'Chưa chạy', running: 'Đang xử lý', error: 'Lỗi', queued: 'Đang chờ', complete: 'Hoàn tất', interrupted: 'Bị gián đoạn' };

function Radar({ scores }) {
  const points = (radius) => [0, 1, 2].map((i) => {
    const angle = (-90 + i * 120) * Math.PI / 180;
    return `${160 + Math.cos(angle) * radius},${115 + Math.sin(angle) * radius}`;
  }).join(' ');
  return <svg className="radar" viewBox="0 0 320 240" role="img" aria-label="Radar Viral, Conversion, SKU; trống khi chưa có điểm">
    {[25, 50, 75, 100].map((r) => <polygon key={r} points={points(r)} fill="none" stroke="#deded8" />)}
    {[0, 1, 2].map((i) => {
      const [x, y] = points(100).split(' ')[i].split(',');
      return <line key={i} x1="160" y1="115" x2={x} y2={y} stroke="#deded8" />;
    })}
    {scores?.every((g) => g.score !== null) && <polygon points={scores.map((g, i) => {
      const angle = (-90 + i * 120) * Math.PI / 180;
      return `${160 + Math.cos(angle) * g.score},${115 + Math.sin(angle) * g.score}`;
    }).join(' ')} fill="#e96b3430" stroke="#b53d0b" strokeWidth="2" />}
    <text x="160" y="10" textAnchor="middle">Viral</text><text x="232" y="194" textAnchor="middle">Conversion</text><text x="83" y="194" textAnchor="middle">SKU</text>
    {!scores?.some((g) => g.score !== null) && <text x="160" y="120" textAnchor="middle" className="radar-wait">Chờ Decisions</text>}
  </svg>;
}

function DataLibrary({ catalog, refresh, onInspect }) {
  const [tab, setTab] = useState('shops');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [datasets, setDatasets] = useState([]);
  useEffect(() => { request('/datasets').then(setDatasets).catch((err) => setError(err.message)); }, []);
  async function submit(event, endpoint) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    if (endpoint === 'skus') values.price_vnd = values.price_vnd === '' ? null : Number(values.price_vnd);
    setBusy(true); setError('');
    try { await request(`/${endpoint}`, { method: 'POST', body: JSON.stringify(values) }); await refresh(); form.reset(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  const tabs = [['shops', 'Shop'], ['skus', 'SKU'], ['videos', 'Video'], ['marketSnapshots', 'Thị trường'], ['datasets', 'Bộ dữ liệu nhập']];
  return <div className="library">
    <div className="tabs">{tabs.map(([key, name]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{name} <span>{catalog[key]?.length || 0}</span></button>)}</div>
    <p className="muted">Thông tin người dùng nhập chưa được đối chiếu với nền tảng. Bấm bản ghi để xem provenance.</p>
    {error && <p className="error" role="alert">{error}</p>}
    {tab === 'shops' && <form className="inline-form" onSubmit={(e) => submit(e, 'shops')}>
      <label>Tên shop<input name="name" placeholder="Tên shop của bạn" required maxLength={120} /></label>
      <label>Ngành hàng<input name="category" placeholder="Ví dụ: Gia dụng" maxLength={120} /></label>
      <Button type="submit" disabled={busy} variant="primary"><Plus size={16} />Thêm shop</Button>
    </form>}
    {tab === 'skus' && <form className="form-grid" onSubmit={(e) => submit(e, 'skus')}>
      <label>Shop<select name="shop_id" required defaultValue=""><option value="" disabled>Chọn shop</option>{catalog.shops.map((shop) => <option value={shop.id} key={shop.id}>{shop.name}</option>)}</select></label>
      <label>Tên sản phẩm<input name="name" required maxLength={200} placeholder="Tên SKU" /></label>
      <label>Giá (VND)<input name="price_vnd" type="number" min="0" max="1000000000" placeholder="Chưa nhập" /></label>
      <label>Link listing<input name="listing_url" type="url" placeholder="https://shopee.vn/..." /></label>
      <label>Audience<input name="audience" maxLength={500} placeholder="Ai sẽ mua sản phẩm này?" /></label>
      <Button type="submit" variant="primary" disabled={busy || !catalog.shops.length}><Plus size={16} />Thêm SKU</Button>
    </form>}
    {tab === 'datasets' && <div className="data-list">{datasets.map((dataset) => <button className="data-row" key={dataset.id} onClick={async () => {
      try { const data = await request(`/datasets/${dataset.id}?limit=100`); onInspect({ title: dataset.name, value: data }); }
      catch (err) { setError(err.message); }
    }}><div><strong>{dataset.name} · {dataset.total} bản ghi</strong><small>{dataset.status} · {dataset.file}</small></div><ChevronRight size={18} /></button>)}</div>}
    {tab !== 'datasets' && <div className="data-list">{catalog[tab]?.length ? catalog[tab].map((record) => <button className="data-row" key={record.id} onClick={() => onInspect({ title: record.name || record.id, value: record })}>
      <div><strong>{record.name || record.id}</strong><small>{record.provenance?.tool || 'Xem nguồn dữ liệu'} · {record.provenance?.collected_at?.slice(0, 10) || record.uploaded_at?.slice(0, 10) || 'Chưa ghi ngày'}</small></div><ChevronRight size={18} />
    </button>) : <Empty icon={Database} title="Chưa có dữ liệu">Thêm thông tin của bạn hoặc bổ sung bộ dữ liệu có nguồn ở bước tiếp theo.</Empty>}</div>}
  </div>;
}

export default function Studio() {
  const [catalog, setCatalog] = useState({ shops: [], skus: [], videos: [], marketSnapshots: [], sources: [] });
  const [registry, setRegistry] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState('');
  const [shopFilter, setShopFilter] = useState('');
  const [form, setForm] = useState(contextFrom());
  const [panel, setPanel] = useState(null);
  const [library, setLibrary] = useState(false);
  const [inspect, setInspect] = useState(null);
  const [warning, setWarning] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(null);
  const [steps, setSteps] = useState({});
  const [result, setResult] = useState(null);
  const [runInfo, setRunInfo] = useState(null);
  const [history, setHistory] = useState([]);
  const [tab, setTab] = useState('platform');
  const [force, setForce] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [rightWidth, setRightWidth] = useState(() => {
    try { return Math.max(400, Math.min(600, Number(localStorage.getItem('preflight-sidebar')) || 420)); } catch { return 420; }
  });
  const fileInput = useRef(null);
  const player = useRef(null);
  const stream = useRef(null);
  const generation = useRef(0);
  const selected = catalog.videos.find((video) => video.id === selectedId);
  const sku = catalog.skus.find((item) => item.id === form.sku_id);
  const activePlatform = form.platforms[0];
  const activePolicy = result?.policy.targets[activePlatform];
  const stageTools = registry?.tools.filter((tool) => tool.stage) || [];

  async function refresh() {
    const data = await request('/catalog');
    setCatalog(data);
    return data;
  }

  useEffect(() => {
    let alive = true;
    Promise.all([request('/catalog'), request('/registry'), request('/health')]).then(([data, config, status]) => {
      if (!alive) return;
      setCatalog(data); setRegistry(config); setHealth(status);
      setSelectedId(data.videos[0]?.id || '');
    }).catch((err) => { if (alive) setError(err.message); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; stream.current?.close(); };
  }, []);

  useEffect(() => {
    const video = catalog.videos.find((item) => item.id === selectedId);
    const ticket = ++generation.current;
    setForm(contextFrom(video)); setDirty(false); setResult(null); setSteps({}); setRunInfo(null); setCurrentTime(0); setHistory([]);
    stream.current?.close();
    if (!video) return;
    Promise.all([request(`/videos/${video.id}/cache-status`), request(`/videos/${video.id}/runs`)]).then(async ([cache, runs]) => {
      if (generation.current !== ticket) return;
      setHistory(runs);
      if (cache.run_id) {
        const run = await request(`/runs/${cache.run_id}`);
        if (generation.current !== ticket) return;
        setResult(run.result); setRunInfo({ ...run, cache_hit: true });
        setSteps(Object.fromEntries(run.result.trace.map((step) => [step.id, step])));
      }
    }).catch((err) => { if (generation.current === ticket) setError(err.message); });
    // Selection intentionally resets editing state only when the selected ID changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function update(values) {
    generation.current++;
    setForm((old) => ({ ...old, ...values })); setDirty(true); setResult(null); setRunInfo(null); setSteps({});
  }

  function seek(sec) {
    if (player.current) { player.current.currentTime = sec; setCurrentTime(sec); }
  }

  async function upload(file) {
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) { setError('Video vượt quá 50 MiB.'); return; }
    setError(''); setUploading(0); setPanel(null);
    try {
      const video = await uploadVideo(file, { ...contextFrom(), shop_id: shopFilter || null }, setUploading);
      await refresh(); setSelectedId(video.id);
    } catch (err) { setError(err.message); }
    finally { setUploading(null); if (fileInput.current) fileInput.current.value = ''; }
  }

  async function analyze(bypass = false) {
    if (!selected || busy) return;
    if (!bypass && (!form.caption || !form.hashtags.length || !form.sku_id)) { setWarning(true); return; }
    setWarning(false); setError(''); setBusy(true); setResult(null); setSteps({});
    const ticket = ++generation.current;
    try {
      await request(`/videos/${selectedId}/context`, { method: 'PATCH', body: JSON.stringify(form) });
      setDirty(false); await refresh();
      const run = await request(`/videos/${selectedId}/runs`, { method: 'POST', body: JSON.stringify({ force_extract: force }) });
      setRunInfo(run);
      const finish = async () => {
        stream.current?.close();
        const saved = await request(`/runs/${run.run_id}`);
        if (ticket !== generation.current) return;
        if (saved.status !== 'complete') throw new Error(saved.error || 'Lượt chạy chưa hoàn tất.');
        setResult(saved.result); setRunInfo({ ...saved, cache_hit: run.cache_hit });
        setSteps(Object.fromEntries(saved.result.trace.map((step) => [step.id, step])));
        setHistory(await request(`/videos/${selectedId}/runs`)); setBusy(false);
      };
      if (run.status === 'complete') { await finish(); return; }
      const source = new EventSource(`/py/runs/${run.run_id}/events`);
      stream.current = source;
      for (const event of ['step_started', 'step_progress', 'step_finished']) {
        source.addEventListener(event, (message) => {
          if (generation.current === ticket) setSteps((old) => stepState(old, event, JSON.parse(message.data)));
        });
      }
      source.addEventListener('run_complete', () => finish().catch((err) => { setError(err.message); setBusy(false); }));
      source.addEventListener('run_error', (message) => {
        source.close(); setError(JSON.parse(message.data).detail); setBusy(false);
      });
      source.onerror = () => {
        source.close();
        if (generation.current === ticket) { setError('Stream bị ngắt. Lượt chạy vẫn được lưu; chọn lại video để xem cache hoặc lịch sử.'); setBusy(false); }
      };
      source.addEventListener('stream_end', () => source.close());
    } catch (err) { setError(err.message); setBusy(false); }
  }

  function resize(event) {
    event.preventDefault();
    const start = event.clientX; const width = rightWidth;
    const move = (e) => setRightWidth(Math.max(400, Math.min(600, width + start - e.clientX)));
    const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop);
  }

  useEffect(() => { try { localStorage.setItem('preflight-sidebar', String(rightWidth)); } catch { /* Storage can be disabled. */ } }, [rightWidth]);

  return <div className="app" style={{ '--right-width': `${rightWidth}px` }}>
    <input ref={fileInput} className="sr-only" type="file" accept=".mp4,.mov,.webm,.mkv" aria-label="Tải video từ máy" onChange={(e) => upload(e.target.files[0])} disabled={busy || uploading !== null} />
    <header className="appbar">
      <a href="/" className="brand"><span className="brand-mark"><Clapperboard size={22} /></span><span>preflight<span className="brand-dot">.</span></span></a>
      <span className="appbar-divider" />
      <label className="nav-select"><Store size={17} /><span className="sr-only">Lọc theo shop</span><select aria-label="Lọc theo shop" value={shopFilter} disabled={busy} onChange={(e) => { const value = e.target.value; setShopFilter(value); if (selected?.shop_id !== value) setSelectedId(''); }}><option value="">Tất cả shop</option>{catalog.shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select></label>
      <label className="nav-select video-select"><Film size={17} /><span className="sr-only">Chọn video</span><select aria-label="Chọn video" disabled={busy} value={selectedId} onChange={(e) => setSelectedId(e.target.value)}><option value="">Chọn video</option>{catalog.videos.filter((v) => !shopFilter || v.shop_id === shopFilter).map((video) => <option key={video.id} value={video.id}>{video.name}</option>)}</select></label>
      <div className="appbar-actions"><Button onClick={() => setLibrary(true)}><Database size={17} /><span>Kho dữ liệu</span></Button><Button disabled={busy || uploading !== null || loading} onClick={() => fileInput.current.click()} variant="dark"><Plus size={18} />Thêm video</Button></div>
    </header>

    {error && <div className="error-banner" role="alert"><span>{error}</span><button className="icon-button" aria-label="Đóng thông báo" onClick={() => setError('')}><X size={18} /></button></div>}
    {uploading !== null && <div className="upload-status" role="status"><LoaderCircle size={18} className="spin" />{uploading < 100 ? `Đang upload ${uploading}%` : 'Đang kiểm tra file video…'}<progress value={uploading} max="100" /></div>}

    <div className="workspace-heading"><div><div className="eyebrow">VIDEO INTELLIGENCE LAB</div><h1>Kiểm tra trước khi đăng<span className="heading-dot">.</span></h1></div><div className="connection"><span className={`connection-dot ${health?.database === 'connected' ? 'online' : ''}`} />{loading ? 'Đang kết nối…' : health?.database === 'connected' ? 'Local workspace' : 'Chưa kết nối DB'}<span className="muted">/</span><span>Chỉ xử lý local</span></div></div>

    <main className="workspace">
      <aside className="pipeline-column">
        <div className="section-title"><div><span className="eyebrow">01 / PHÂN TÍCH</span><h2>Luồng xử lý</h2></div><Workflow size={20} /></div>
        <p className="section-note">Theo dõi từng bước và mở dữ liệu vào / ra.</p>
        <div className="pipeline-list" aria-live="polite">{stageTools.map((tool, index) => {
          const step = steps[tool.id];
          const Icon = step?.status === 'ok' ? CircleCheck : step?.status === 'running' ? LoaderCircle : step?.status === 'skipped' ? CircleHelp : Circle;
          return <button className={`pipeline-step ${step?.status || ''}`} key={tool.id} disabled={!step} onClick={() => setInspect({ title: tool.name, value: step })}>
            <span className="step-track"><Icon size={20} className={step?.status === 'running' ? 'spin' : ''} /></span>
            <span className="step-body"><span className="step-overline">{String(index + 1).padStart(2, '0')} · {tool.agent.replaceAll('_', ' ')}</span><strong>{tool.name}</strong><span className="step-status">{step ? statusLabels[step.status] || step.status : 'Chờ phân tích'}{step?.duration_s !== undefined && ` · ${metric(step.duration_s)}s`}</span>{step?.status === 'running' && step.total && <progress value={step.done} max={step.total} />}</span>
          </button>;
        })}</div>
        <div className="pipeline-footer"><span className="connection-dot online" /><span>Pipeline cố định · {registry?.agents.length || 4} vai trò agent</span></div>
        <button className="text-button" onClick={() => setInspect({ title: 'Agent & tool registry', value: registry })}><FileJson size={16} />Xem registry và trạng thái tool<ArrowRight size={15} /></button>
        <div className="mini-note"><ShieldCheck size={18} /><p>Các bước AI chỉ chạy khi đã có dữ liệu và provider được cho phép.</p></div>
      </aside>

      <section className="studio-column" aria-label="Video studio">
        <div className="studio-toolbar"><span><span className="eyebrow">02 / VIDEO STUDIO</span></span><span className="subtle-tag">{selected ? `${metric(selected.metadata.width)} × ${metric(selected.metadata.height)}` : 'Chưa có video'}</span></div>
        <div className="phone-stage"><nav className="edit-rail" aria-label="Thiết lập video">{rail.map(([key, Icon, title]) => <button key={key} disabled={busy} className={panel === key ? 'active' : ''} onClick={() => setPanel(key)}><span><Icon size={20} /></span>{title}</button>)}</nav>
          <div className={`phone ${activePlatform}`}>
            <div className="phone-top"><span>{platformNames[activePlatform]}</span><span className="phone-notch" /></div>
            <div className="phone-screen">
              {selected ? <video key={selectedId} ref={player} src={`/py/videos/${selectedId}/media`} controls playsInline preload="metadata" onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)} /> : <div className="phone-empty"><div className="upload-glyph"><Upload size={30} strokeWidth={1.4} /></div><h2>Video tiếp theo<br />bắt đầu từ đây.</h2><p>Đưa video của bạn lên để kiểm tra nội dung trước khi đăng.</p><Button variant="primary" disabled={loading || uploading !== null} onClick={() => fileInput.current.click()}><Plus size={17} />Chọn video từ máy</Button><small>MP4, MOV, WebM, MKV<br />Tối đa 50 MiB · 120 giây</small></div>}
            </div>
            {selected && <div className="phone-caption"><strong>@{catalog.shops.find((s) => s.id === form.shop_id)?.name || 'Video của bạn'}</strong><p>{form.caption || 'Chưa nhập caption'}</p>{sku && <span className="product-pill"><Package size={14} />{sku.name}</span>}</div>}
            <div className="phone-bottom"><span className="home-indicator" /></div>
          </div>
        </div>
        <div className="timeline-section"><div className="timeline-title"><span>{selected?.name || 'Chưa chọn video'}</span><span className="mono">{timeLabel(currentTime)} / {timeLabel(selected?.metadata.duration_s)}</span></div><input type="range" min="0" max={selected?.metadata.duration_s || 1} step="0.01" value={currentTime} onChange={(e) => seek(Number(e.target.value))} disabled={!selected} aria-label="Tua video" />
          <div className="frames">{result?.extraction.frames.map((frame) => <button key={frame.id} onClick={() => seek(frame.sec)} aria-label={`Tua đến ${timeLabel(frame.sec)}`}><img src={frame.url} alt={`Frame tại ${timeLabel(frame.sec)}`} /><span>{timeLabel(frame.sec)}</span></button>) || <span className="muted">Keyframe sẽ xuất hiện sau khi trích xuất.</span>}</div>
        </div>
        <div className="analyze-bar"><div><span className="local-tag"><ShieldCheck size={14} />Local</span><small>0 lượt gọi API bên ngoài</small></div><Button variant="primary" disabled={!selected || busy || uploading !== null} onClick={() => analyze()}>{busy ? <LoaderCircle size={18} className="spin" /> : <Play size={17} fill="currentColor" />}{busy ? 'Đang phân tích…' : 'Phân tích video'}<ArrowRight size={17} /></Button></div>
        {selected && <div className="analysis-options"><label><input type="checkbox" checked={force} disabled={busy} onChange={(e) => setForce(e.target.checked)} />Trích frame lại</label><button className="text-button" onClick={() => setInspect({ title: 'Lịch sử phân tích', value: history })}><Clock3 size={14} />{history.length} lượt đã lưu</button>{dirty && <span>Thông tin sẽ lưu khi phân tích</span>}</div>}
      </section>

      <aside className="results-column">
        <div className="resize-handle" role="separator" aria-label="Điều chỉnh độ rộng kết quả" aria-orientation="vertical" aria-valuemin={400} aria-valuemax={600} aria-valuenow={rightWidth} tabIndex={0} onPointerDown={resize} onDoubleClick={() => setRightWidth(420)} onKeyDown={(e) => { if (['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); setRightWidth((v) => Math.max(400, Math.min(600, v + (e.key === 'ArrowLeft' ? 20 : -20)))); } }} />
        <div className="section-title"><div><span className="eyebrow">03 / KẾT QUẢ</span><h2>Sẵn sàng đăng?</h2></div><button className="icon-button" aria-label="Mở kết quả JSON" disabled={!result} onClick={() => setInspect({ title: 'Kết quả backend', value: result })}><Maximize2 size={18} /></button></div>
        <div className="score-block"><div className="score-number">{metric(result?.scores.overall)}<span>/ 100</span></div><div className="score-caption"><strong>{busy ? 'Đang thu thập bằng chứng' : result ? result.verdict.label : 'Chờ phân tích'}</strong><span>Coverage {result ? metric(result.scores.coverage * 100) + '%' : '—'}</span></div></div>
        <button className="policy-chip" onClick={() => setInspect({ title: 'Policy theo nền tảng', value: result?.policy || { status: 'unknown', reason: 'Chưa phân tích; chưa đối chiếu Policy.' } })}><ShieldCheck size={15} />Policy · {activePolicy?.label || 'chưa đủ dữ liệu'}<ChevronRight size={14} /></button>
        <Radar scores={result?.scores.groups} />
        <div className="group-scores">{groupNames.map((name, i) => <div key={name}><span>{name}</span><strong>{metric(result?.scores.groups[i]?.score)}</strong></div>)}</div>
        <p className="result-summary">{result ? result.verdict.summary : 'Mỗi kết luận bắt đầu từ bằng chứng. Chọn video và bấm Phân tích để kiểm tra.'}</p>
        <div className="tabs result-tabs">{[['platform', 'Nền tảng'], ['evidence', 'Bằng chứng'], ['performance', 'Hiệu suất']].map(([key, name]) => <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{name}</button>)}</div>
        <div className="result-tab-content">
          {tab === 'platform' && <>{form.platforms.map((platform) => <button className="platform-result" key={platform} onClick={() => setInspect({ title: platformNames[platform], value: result?.policy.targets[platform] || { status: 'unknown', reason: 'Chưa đối chiếu baseline và thông số chính thức.' } })}><span className="platform-initial">{platformNames[platform][0]}</span><div><strong>{platformNames[platform]}</strong><small>Policy & hợp nền tảng</small></div><span className="status-tag">{result?.policy.targets[platform]?.label || 'Chưa xác minh'}</span><ChevronRight size={15} /></button>)}<p className="muted fine">Checklist nền tảng tách riêng khỏi điểm. Chưa có nguồn thì chưa kết luận.</p></>}
          {tab === 'evidence' && (result ? <><div className="evidence-stats"><span><strong>{result.extraction.frames.length}</strong> frame local</span><span><strong>{result.trace.length}</strong> bước trace</span></div><Button className="full" onClick={() => setInspect({ title: 'Feature JSON & bằng chứng', value: result.features })}><FileJson size={17} />Xem feature JSON<ArrowRight size={15} /></Button><p className="muted fine">Lời thoại: chưa cấu hình ASR. Frame chưa được AI đọc nội dung.</p><span className="status-tag">{runInfo?.cache_hit ? 'Kết quả từ cache' : `Frame cache: ${result.extraction.cache}`}</span></> : <Empty icon={FileJson} title="Chưa có bằng chứng">Frame, transcript và feature sẽ hiện tại đây.</Empty>)}
          {tab === 'performance' && <><div className="funnel">{[['Views', form.outcome?.views], ['Click', form.outcome?.clicks], ['Đơn', form.outcome?.orders], ['GMV', form.outcome?.gmv_vnd]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{metric(value)}</strong></div>)}</div><p className="muted fine">{form.published ? 'Số liệu người dùng nhập, chưa xác minh. Không tính vào điểm trước đăng.' : 'Video trước đăng chưa có hiệu suất thực. Chưa có mô hình dự báo đã hiệu chỉnh.'}</p><button className="text-button" disabled={busy} onClick={() => setPanel('video')}>Cập nhật trạng thái đăng<ChevronRight size={15} /></button></>}
        </div>
        {result && <details className="missing-inputs"><summary>Dữ liệu cần bổ sung <span>{result.verdict.missing_inputs.length}</span></summary>{result.verdict.missing_inputs.map((gap) => <div key={gap.key}><strong>{gap.title}</strong><p>{gap.how}</p></div>)}</details>}
      </aside>
    </main>
    <footer className="app-footer"><span>preflight / video intelligence lab</span><span>Video → bằng chứng → quyết định</span><span>Workspace mới · 31.10.2026</span></footer>

    <Modal open={library} onOpenChange={setLibrary} title="Kho dữ liệu" description="Quản lý shop, SKU, video và nguồn dữ liệu của workspace." wide><DataLibrary catalog={catalog} refresh={refresh} onInspect={setInspect} /></Modal>
    <Modal open={!!inspect} onOpenChange={(open) => { if (!open) setInspect(null); }} title={inspect?.title || 'Chi tiết'} wide><Json value={inspect?.value} /></Modal>
    <Modal open={!!panel} onOpenChange={(open) => { if (!open) setPanel(null); }} title={rail.find(([key]) => key === panel)?.[2] || 'Thiết lập'} description="Cập nhật đầu vào. Kết quả cũ sẽ được vô hiệu khi bạn thay đổi thông tin.">
      <div className="panel-form">
        {panel === 'video' && <><Button variant="primary" disabled={busy} onClick={() => fileInput.current.click()}><Upload size={18} />Chọn video khác từ máy</Button>{selected && <><p>{selected.name} · {timeLabel(selected.metadata.duration_s)} · {metric(selected.metadata.width)} × {metric(selected.metadata.height)}</p><label className="checkbox-label"><input type="checkbox" checked={form.published} onChange={(e) => update({ published: e.target.checked, outcome: null })} />Video đã đăng</label>{form.published && <div className="form-grid">{[['views', 'Views'], ['clicks', 'Click'], ['orders', 'Đơn'], ['gmv_vnd', 'GMV (VND)']].map(([key, label]) => <label key={key}>{label}<input type="number" min="0" step={key === 'gmv_vnd' ? 'any' : '1'} value={form.outcome?.[key] ?? ''} onChange={(e) => update({ outcome: { ...form.outcome, [key]: e.target.value === '' ? null : Number(e.target.value) } })} /></label>)}</div>}<Button onClick={() => setInspect({ title: 'Số đo file video', value: selected.metadata })}><FileJson size={17} />Số đo từ file</Button></>}</>}
        {panel === 'caption' && <><label>Caption<textarea rows={5} maxLength={3000} value={form.caption} onChange={(e) => update({ caption: e.target.value })} placeholder="Mô tả video, lợi ích và lời kêu gọi hành động…" /></label><label>Hashtag<input defaultValue={form.hashtags.map((tag) => `#${tag}`).join(' ')} onChange={(e) => update({ hashtags: e.target.value.split(/\s+/).filter(Boolean).map((v) => v.replace(/^#/, '')) })} placeholder="#sanpham #review" /></label><p className="muted">Gợi ý caption bằng AI sẽ được nối ở bước tiếp theo.</p></>}
        {panel === 'product' && <><label>Shop<select value={form.shop_id || ''} onChange={(e) => update({ shop_id: e.target.value || null, sku_id: null })}><option value="">Chưa gắn shop</option>{catalog.shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.name}</option>)}</select></label><label>SKU gắn video<select value={form.sku_id || ''} onChange={(e) => { const item = catalog.skus.find((s) => s.id === e.target.value); update({ sku_id: item?.id || null, audience: form.audience || item?.audience || '' }); }}><option value="">Chưa gắn SKU</option>{catalog.skus.filter((item) => item.shop_id === form.shop_id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{sku && <div className="sku-card"><Package size={22} /><div><strong>{sku.name}</strong><p>{metric(sku.price_vnd)} VND</p>{sku.listing_url && <a href={sku.listing_url} target="_blank" rel="noreferrer">Mở listing nguồn ↗</a>}</div></div>}<Button onClick={() => { setPanel(null); setLibrary(true); }}><Plus size={16} />Thêm shop / SKU vào Kho dữ liệu</Button></>}
        {panel === 'audience' && <><label>Ai là người xem và người mua mục tiêu?<textarea rows={5} value={form.audience} maxLength={500} onChange={(e) => update({ audience: e.target.value })} placeholder="Nhu cầu, bối cảnh sử dụng, nhóm người mua…" /></label><p className="muted">Audience được lấy từ SKU khi bạn chọn sản phẩm, hoặc do bạn nhập. Chưa có luồng AI suy ra audience từ video.</p></>}
        {panel === 'platform' && <div className="platform-options">{Object.entries(platformNames).map(([key, name]) => <label key={key} className={activePlatform === key ? 'selected' : ''}><input type="radio" name="platform" value={key} checked={activePlatform === key} onChange={() => update({ platforms: [key] })} /><span className="platform-initial">{name[0]}</span><span><strong>{name}</strong><small>Điểm trên nền tảng này: chưa chấm</small></span>{activePlatform === key && <Check size={18} />}</label>)}<p className="muted">Chọn nơi bạn dự định đăng. Policy và thông số sẽ đối chiếu theo nền tảng này.</p></div>}
        <Button variant="dark" onClick={() => setPanel(null)}>{panel === 'product' && sku ? 'Giữ SKU này' : 'Xong'}<Check size={17} /></Button>
      </div>
    </Modal>
    <Modal open={warning} onOpenChange={setWarning} title="Bổ sung trước khi phân tích" description="Thông tin còn thiếu sẽ làm giảm dữ liệu dùng để đánh giá video.">
      <div className="warning-items">{[[!form.caption, 'caption', 'Chưa có caption'], [!form.hashtags.length, 'caption', 'Chưa có hashtag'], [!form.sku_id, 'product', 'Chưa gắn SKU']].filter(([show]) => show).map(([, key, title]) => <button key={title} onClick={() => { setWarning(false); setPanel(key); }}><span>{title}</span><span>Cập nhật <ChevronRight size={16} /></span></button>)}</div><div className="dialog-actions"><Button onClick={() => setWarning(false)}>Để sau</Button><Button variant="primary" onClick={() => analyze(true)}>Vẫn phân tích<ArrowRight size={16} /></Button></div>
    </Modal>
  </div>;
}
