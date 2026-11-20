import { useUiStore } from '../store/uiStore';

/** Выключатель потолочного света активной комнаты (SPEC D-11). Состояние по комнатам, вне проекта и истории. */
export function RoomLightSwitch({ roomId }: { roomId: string }) {
  // В прогулке выключатель относится к комнате, в которой стоит игрок.
  const walkRoom = useUiStore((state) => (state.walk ? state.walkRoomId : null));
  const target = walkRoom ?? roomId;
  const on = useUiStore((state) => state.roomLights[target] === true);
  const toggle = useUiStore((state) => state.toggleRoomLight);
  return (
    <div className="room-light" data-testid="room-light">
      <button type="button" className={`button${on ? ' is-active' : ''}`} role="switch" aria-checked={on}
        aria-label="Свет в комнате" onClick={() => toggle(target)}>
        {on ? 'Свет включён' : 'Свет выключен'}
      </button>
    </div>
  );
}
