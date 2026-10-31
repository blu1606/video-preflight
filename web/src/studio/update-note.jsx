import { Icon } from './icon'

/**
 * Reminder to fill in the post info of an uploaded video: after the upload, and again before a run while
 * something is still missing. Each item opens the panel that fixes it; `onContinue` goes on without fixing.
 */
export function UpdateNote({ items, reason, onOpenPanel, onContinue, onClose }) {
  const beforeRun = reason === 'run'
  return (
    <div className="deep-modal">
      <div className="deep-scrim" onClick={onClose} />
      <section className="deep-dialog studio-update-note" role="dialog" aria-modal="true" aria-labelledby="update-note-title">
        <header className="ep-head">
          <h2 id="update-note-title">{beforeRun ? 'Cập nhật thông tin trước khi phân tích?' : 'Cập nhật thông tin video'}</h2>
          <button type="button" className="ep-x" onClick={onClose} aria-label="Đóng"><Icon name="close" /></button>
        </header>
        <p className="tiny muted">Caption, hashtag và sản phẩm được chấm điểm và kiểm policy cùng video. Điền đủ để kết quả sát với lúc đăng thật.</p>
        <ul className="studio-update-list">
          {items.map((it) => (
            <li key={it.id}>
              <span>{it.label}</span>
              <button type="button" className="btn" onClick={() => onOpenPanel(it.panel)}>Cập nhật</button>
            </li>
          ))}
        </ul>
        <footer className="studio-update-foot">
          <button type="button" className="btn" onClick={onContinue}>{beforeRun ? 'Vẫn phân tích' : 'Để sau'}</button>
          <button type="button" className="btn btn-primary" onClick={() => onOpenPanel(items[0].panel)}>Cập nhật ngay</button>
        </footer>
      </section>
    </div>
  )
}
