import { useEffect, useMemo, useState } from 'react';
import { Color, DoubleSide, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace, TextureLoader, type Texture } from 'three';
import { textureRepeatPerMeter } from '../commands/finishes';
import type { MaterialDefinition } from '../domain/types';
import { patternTexture } from './wallpaperPatterns';

// Материал отделки для 3D. Текстуры общие для всех стен (кеш по материалу), материал — свой у каждой
// стороны, чтобы подсветка выбора не меняла соседние. Рисунок задан в физических см (1 единица UV = 1 м).

const textures = new Map<string, Texture>();
const loader = new TextureLoader();

function configure(texture: Texture, tile: { width: number; height: number }): Texture {
  const repeat = textureRepeatPerMeter(tile);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeat.x, repeat.y);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  return texture;
}

/** Текстура материала; для файлов может прийти позже — тогда вызывается onReady. */
export function finishTexture(material: MaterialDefinition, onReady?: () => void): Texture | null {
  if (!material.tileSizeCm) return null;
  const cached = textures.get(material.id);
  if (cached) return cached;
  if (material.pattern) {
    const texture = configure(patternTexture(material.pattern.kind, material.pattern.colors), material.tileSizeCm);
    textures.set(material.id, texture);
    return texture;
  }
  if (material.textureUrl) {
    const texture = loader.load(material.textureUrl, () => onReady?.());
    configure(texture, material.tileSizeCm);
    textures.set(material.id, texture);
    return texture;
  }
  return null;
}

export function useFinishMaterial(definition: MaterialDefinition | undefined, selected: boolean): MeshStandardMaterial | null {
  const [, setReady] = useState(0);
  const material = useMemo(() => {
    if (!definition && !selected) return null;
    const result = new MeshStandardMaterial({ side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    if (definition) {
      result.color = new Color(definition.color);
      result.roughness = definition.roughness ?? 0.9;
      const texture = finishTexture(definition, () => setReady((n) => n + 1));
      if (texture) { result.map = texture; result.color = new Color('#ffffff'); }
    } else {
      result.color = new Color('#7fb4ff');
      result.transparent = true;
      result.opacity = 0.3;
      result.depthWrite = false;
    }
    if (selected) { result.emissive = new Color('#2b4f9a'); result.emissiveIntensity = 0.45; }
    return result;
  }, [definition, selected]);
  useEffect(() => () => material?.dispose(), [material]);
  return material;
}
