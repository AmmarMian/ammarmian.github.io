import scene from '../src/scene.wgsl?raw';
import post from '../src/post.wgsl?raw';
(async () => {
  const a = await navigator.gpu.requestAdapter();
  const d = await a!.requestDevice();
  d.lost.then((i) => console.log('LOST', i.reason, i.message));
  for (const [name, code] of [['scene', scene], ['post', post]] as const) {
    const m = d.createShaderModule({ code });
    const info = await m.getCompilationInfo();
    for (const msg of info.messages) console.log('MSG', name, msg.type, msg.lineNum, msg.message.split('\n')[0]);
    d.pushErrorScope('validation');
    try {
      const vs = d.createShaderModule({ code: '@vertex fn v(@builtin(vertex_index) i:u32)->@builtin(position) vec4f{let p=array(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(p[i],0,1);}' });
      await d.createRenderPipelineAsync({ layout: 'auto', vertex: { module: vs }, fragment: { module: m, targets: [{ format: 'rgba16float' }] } });
      console.log('PIPE', name, 'ok');
    } catch (e: any) { console.log('PIPE', name, 'err', e.message); }
    const e = await d.popErrorScope();
    if (e) console.log('SCOPE', name, e.message);
  }
  document.body.dataset.ready = '1';
})();
