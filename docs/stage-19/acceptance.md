# Приёмка: критерии AC-01–AC-19 (SPEC §13)

**Итог 20.11.2026:** релиз 1.0 завершён по решению пользователя. Выполнено 18 критериев из 19; AC-14 — частично (замеры на Mac M1 в Chrome выполнены, на эталонном ПК и в Edge нет). Из релиза исключены проверки в Edge и на эталонном ПК и подготовка моделей 13.2–13.4.

Дата свода: 19.11.2026. Запуск: `npm run typecheck && npm test && npm run build && npm run e2e -- --project=chrome` — всё зелёное по запуску пользователя на Mac (Apple M1, Chrome). Edge на этом Mac не установлен, эталонный ПК не использовался.

Статусы: **выполнен** — проверка есть и зелёная; **частично** — часть условий не проверена; **не выполнен** — функция отложена.

| AC | Статус | Доказательства |
|---|---|---|
| AC-01 Стартовый сценарий без авто-мебели | выполнен | tests/e2e/start-flow.spec.ts, scenario-stage15.spec.ts, templates.test.ts |
| AC-02 Масштаб 100 см одинаков | выполнен | tests/unit/model.test.ts, tests/e2e/tech-scene.spec.ts |
| AC-03 Общая стена, откат при конфликте | выполнен | tests/unit/setup.test.ts, tests/e2e/setup-stage8.spec.ts |
| AC-04 Общая дверь с двух сторон | выполнен | tests/unit/openings.test.ts, geometry.test.ts, tests/e2e/openings-stage9.spec.ts |
| AC-05 Одна комната в 3D, вся квартира в прогулке | выполнен | tests/e2e/rooms-stage10.spec.ts, sync-stage11.spec.ts, walk-stage24.spec.ts |
| AC-06 Размещение из каталога через 2D и 3D | выполнен | tests/e2e/tech-scene.spec.ts, parity-stage14.spec.ts, placement-stage14.spec.ts |
| AC-07 Поворот, выход за стену, пересечения, отмена | выполнен | tests/unit/placement.test.ts, catalog-placement.test.ts, tests/e2e/placement-stage14.spec.ts |
| AC-08 Невалидное отпускание, камера снова управляется | выполнен | tests/e2e/tech-scene.spec.ts |
| AC-09 Конфликт с мебелью в скрытом помещении | выполнен | tests/unit/stage15.test.ts |
| AC-10 Проёмы не выходят за стену и не пересекаются | выполнен | tests/unit/openings.test.ts, geometry.test.ts |
| AC-11 Отделка по стороне, физический масштаб обоев | выполнен | tests/unit/finishes.test.ts, tests/e2e/finishes-stage12.spec.ts |
| AC-12 Реальные модели, размеры, источники | выполнен | tests/unit/catalog.test.ts (лицензии CC0 у всех предметов), ASSETS.md (все предметы каталога внесены) |
| AC-13 Ошибка модели и ввода не ломают работу | выполнен | tests/unit/model-errors.test.ts, stage18.test.ts, tests/e2e/model-errors.spec.ts, scenario-stage15.spec.ts |
| AC-14 Замеры на записанном оборудовании | частично | Mac M1, Chrome, production: 60 FPS, p95 ≤17,2 мс, сцена 683 мс, модель ≤243 мс; прогулка 60 FPS (docs/stage-18/perf-mac.json, docs/stage-24/perf-mac.json). Не сделано: эталонный ПК (GTX 1660 SUPER) и Edge |
| AC-15 Финальный рендер по эталону качества | выполнен | «Качественный снимок» реализован (src/scene3d/QualitySnapshot.tsx, tests/e2e/snapshot-stage17.spec.ts, кадры docs/stage-17, docs/stage-21/snapshot-*, docs/stage-23/snapshot-*, docs/stage-16/pt-*); проект не меняется, снимок закрывается при любой правке. Качество и время приняты пользователем 20.11.2026 (M1: 64 выборки — 76 с, 256 — 307 с); на эталонном ПК и в Edge не проверялся |
| AC-16 Отмена и повтор целиком, горячие клавиши | выполнен | tests/unit/stage15.test.ts, commands.test.ts, tests/e2e/keyboard-stage18.spec.ts |
| AC-17 Время суток: свет и мир, вне истории | выполнен | tests/unit/timeOfDay.test.ts, lighting.test.ts, tests/e2e/time-stage20.spec.ts, world-stage20.spec.ts, lighting-stage20.spec.ts, glass-stage20.spec.ts, leak-stage20.spec.ts |
| AC-18 Светильники и люстры | выполнен | tests/unit/ceilingLight.test.ts, lamps.test.ts, walkLights.test.ts, tests/e2e/light-stage21.spec.ts, lamps-stage21.spec.ts; кадры docs/stage-21/lamps-*.png |
| AC-19 Покрытие пола | выполнен | tests/unit/floor.test.ts, tests/e2e/floor-stage23.spec.ts |

## Отложено и не проверено

- «Качественный снимок» принят (17.5); на эталонном ПК и в Edge не проверялся.
- Edge: 18.5, 20.6, 21.7, 22.3, 24.6, 25.6. Edge не установлен на Mac пользователя; 20.11.2026 пользователь решил проверку в Edge пропустить. Набор e2e в Edge ни разу не проходил.
- Эталонный ПК: повтор замеров D-08 (`PERF_LABEL=reference`).
- Оптимизация моделей и коллайдеры: 13.2–13.4 (исключены из релиза 1.0).
- Лицензия FurniMesh (SPEC §12): модели FurniMesh в проекте не используются; вопрос открыт до публикации.
- Публикация, деплой и внешние сервисы не выполнялись.
