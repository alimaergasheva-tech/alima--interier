import { TIME_PRESETS, activePreset, formatHour } from '../scene3d/timeOfDay';
import { useUiStore } from '../store/uiStore';

/** Ползунок времени суток и быстрые кнопки (SPEC D-12). Состояние только в интерфейсе: в проект и в историю не попадает. */
export function TimeOfDayControl() {
  const hour = useUiStore((state) => state.timeOfDay);
  const setTimeOfDay = useUiStore((state) => state.setTimeOfDay);
  const preset = activePreset(hour);
  return (
    <div className="time-of-day" role="group" aria-label="Время суток" data-testid="time-of-day">
      <div className="time-of-day-row">
        <label htmlFor="time-of-day-slider">Время суток</label>
        <output htmlFor="time-of-day-slider" data-testid="time-of-day-value">{formatHour(hour)}</output>
      </div>
      <input id="time-of-day-slider" type="range" min={0} max={24} step={0.25} value={hour}
        aria-label="Время суток" aria-valuetext={formatHour(hour)}
        onChange={(event) => setTimeOfDay(Number(event.target.value))} />
      <div className="time-of-day-presets">
        {TIME_PRESETS.map((item) => (
          <button key={item.id} type="button" className={`button${preset === item.id ? ' is-active' : ''}`}
            aria-pressed={preset === item.id} onClick={() => setTimeOfDay(item.hour)}>{item.label}</button>
        ))}
      </div>
    </div>
  );
}
