import { BrandMark } from './phone-feeds'
import { PREVIEW_SKINS, skinScore } from './platform-skins'

/** The preview skins as a list: brand mark, name, note and this platform's content score when a result exists. */
export function SkinOptions({ skin, rows, onPick }) {
  return (
    <ul className="pf-menu" role="listbox" aria-label="Giao diện xem trước">
      {PREVIEW_SKINS.map((s) => {
        const on = s.id === skin
        const score = skinScore(rows, s.id)
        return (
          <li key={s.id}>
            <button type="button" className={`pf-opt${on ? ' is-on' : ''}`} role="option" aria-selected={on} onClick={() => onPick(s.id)}>
              <BrandMark id={s.brand} size={28} />
              <span className="od-stack od-fill" style={{ '--od-gap': 0 }}>
                <span><strong>{s.name}</strong></span>
                <span className="tiny muted">{s.note}</span>
                {score != null && <span className="tiny">Điểm trên nền tảng này: <strong>{score}</strong></span>}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
