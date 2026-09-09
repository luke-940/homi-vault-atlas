import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';

async function loadModule(path) {
  const source = new URL(path, import.meta.url);
  const bundle = await build({ entryPoints: [source.pathname], bundle: true, platform: 'node', format: 'esm', write: false,
    define: { 'import.meta.url': JSON.stringify(source.href) } });
  return import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
}
const { captureSceneHistory, resolveSceneReturn } = await loadModule('../src/scene-return.ts');
const { AtlasWorld } = await loadModule('../src/world.ts');
const camera = sceneId => ({ sceneId, position: [24, 21, 32], target: [1, 3, -4], zoom: 1, fov: 37, selectedPlaceId: `${sceneId}-place` });
const state = (sceneId, stage) => ({ sceneId, stage });

test('failed Common/Rocket Reader and map returns retain destination, including stale pre-fix history', () => {
  for (const id of ['common', 'rocket']) {
    const failed = state(id, 'error');
    const saved = captureSceneHistory(failed, camera('groot'));
    assert.equal(saved.camera, undefined, 'the visible old Groot backdrop is not the failed destination camera');
    assert.equal(saved.sceneState.sceneId, id);
    assert.deepEqual(resolveSceneReturn(id, true, saved, failed), { kind: 'retain' });
    assert.deepEqual(resolveSceneReturn(undefined, true, saved, failed), { kind: 'retain' }, 'map/Reader history carries the requested destination');
    assert.deepEqual(resolveSceneReturn(id, true, { camera: camera('groot') }, failed), { kind: 'retain' }, 'explicit hash outranks old history camera');
  }
});

test('closing an overlay during a slow transition leaves the existing request in flight', () => {
  const loading = state('common', 'loading');
  const saved = captureSceneHistory(loading, camera('groot'));
  assert.deepEqual(resolveSceneReturn('common', true, saved, loading), { kind: 'retain' });
  assert.deepEqual(resolveSceneReturn(undefined, true, saved, loading), { kind: 'retain' });
});

test('ready same-island Reader/map history restores the exact camera and selected place', () => {
  const pose = camera('groot'), saved = captureSceneHistory(state('groot', 'ready'), pose);
  for (const route of ['groot', undefined]) {
    const result = resolveSceneReturn(route, true, saved, state('groot', 'ready'));
    assert.equal(result.kind, 'camera');
    assert.equal(result.camera, pose);
  }
});

test('explicit world/island history may leave another failed target, while a fresh overlay does not navigate', () => {
  const saved = { camera: camera('world'), sceneState: state('world', 'ready') };
  assert.equal(resolveSceneReturn('world', true, saved, state('common', 'error')).kind, 'camera');
  assert.deepEqual(resolveSceneReturn('rocket', true, saved, state('common', 'error')), { kind: 'navigate', sceneId: 'rocket' });
  assert.deepEqual(resolveSceneReturn(undefined, false, saved, state('common', 'error')), { kind: 'none' });
  assert.deepEqual(resolveSceneReturn('common', false, saved, state('common', 'error')), { kind: 'navigate', sceneId: 'common' }, 'explicit entry can retry');
});

test('overlay reload remembers its requested island even when there is no saved renderable camera', () => {
  const saved = captureSceneHistory(state('common', 'error'), camera('groot'));
  assert.deepEqual(resolveSceneReturn(undefined, true, saved, state('world', 'loading')), { kind: 'navigate', sceneId: 'common' });
});

function rendererDouble(stage, loaded = 'groot') {
  const calls = [];
  const renderer = {
    lastStage: stage, current: { id: loaded }, sceneId: loaded, desiredScene: stage.sceneId,
    contextLost: false, pendingSnapshot: undefined,
    validSnapshot: AtlasWorld.prototype.validSnapshot,
    cancelPendingLoad() { calls.push('cancel'); this.lastStage = state(loaded, 'ready'); },
    async loadScene(id) { calls.push(['load', id]); return true; },
    applySnapshot(pose) { calls.push(['apply', pose]); },
  };
  return { renderer, calls };
}

test('runtime rejects a cross-scene camera without canceling the failed target or changing desired scene', async () => {
  const { renderer, calls } = rendererDouble(state('common', 'error'));
  assert.equal(await AtlasWorld.prototype.restoreCamera.call(renderer, camera('groot'), 'common'), false);
  assert.equal(renderer.desiredScene, 'common');
  assert.equal(renderer.lastStage.stage, 'error');
  assert.deepEqual(calls, []);
});

test('runtime keeps failure explicit and queues matching camera during an existing load instead of restarting', async () => {
  const pose = camera('common');
  for (const stage of ['loading', 'error']) {
    const { renderer, calls } = rendererDouble(state('common', stage));
    assert.equal(await AtlasWorld.prototype.restoreCamera.call(renderer, pose, 'common'), false);
    assert.equal(renderer.lastStage.stage, stage);
    assert.deepEqual(calls, []);
    assert.equal(renderer.pendingSnapshot, stage === 'loading' ? pose : undefined);
  }
});

test('runtime applies a matching ready camera exactly, and intentional world history can cancel another failed target', async () => {
  const pose = camera('groot');
  for (const current of [state('groot', 'ready'), state('common', 'error')]) {
    const { renderer, calls } = rendererDouble(current);
    assert.equal(await AtlasWorld.prototype.restoreCamera.call(renderer, pose, 'groot'), true);
    assert.equal(renderer.desiredScene, 'groot');
    assert.deepEqual(calls, ['cancel', ['apply', pose]]);
  }
});

test('an existing scene load applies its queued matching history camera after default framing and before ready', async () => {
  for (const savedScene of ['world', 'groot']) {
    const calls = [], pose = camera(savedScene), loaded = { id: 'world', root: {} };
    const renderer = {
      disposed: false, contextLost: false, generation: 0, worldCache: loaded,
      pendingSnapshot: pose, transitionSamples: [], ready: true,
      announce(value) { calls.push(['stage', value.stage]); },
      clearPulse() {}, scene: { add() {} }, configureScene() {}, collectAnimatedObjects() {},
      setSceneCamera() { calls.push('default-camera'); },
      applySnapshot(value) { calls.push(['apply', value]); }, invalidate() {},
    };
    assert.equal(await AtlasWorld.prototype.loadScene.call(renderer, 'world'), true);
    assert.deepEqual(calls, [['stage', 'loading'], 'default-camera',
      ...(savedScene === 'world' ? [['apply', pose]] : []), ['stage', 'ready']]);
    assert.equal(renderer.pendingSnapshot, undefined);
  }
});
