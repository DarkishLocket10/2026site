// Share the upload budget across mounts: at most one warm-up operation per frame.
// Jobs check their mount's lifetime before touching the GPU.
const jobs: Array<() => void> = [];
let scheduled = false;
function run() {
  jobs.shift()?.();
  scheduled = jobs.length > 0;
  if (scheduled) requestAnimationFrame(run);
}
export function frameWork<T>(work: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    jobs.push(() => { try { resolve(work()); } catch (error) { reject(error); } });
    if (!scheduled) { scheduled = true; requestAnimationFrame(run); }
  });
}
