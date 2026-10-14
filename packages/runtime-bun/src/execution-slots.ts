/** Admission inside the native executor, shared by start/recovery/resume paths. This is a
 * process-local limit and resource exclusion, not durable ownership of an execution. */
export class ExecutionSlots {
  private active = 0;
  private readonly held = new Set<string>();
  private readonly waiting: {keys: readonly string[]; resolve: (release: () => void) => void}[] = [];
  constructor(readonly capacity: number) {}

  acquire(raw: readonly string[]): Promise<() => void> {
    if (!Array.isArray(raw) || raw.length > 100 || raw.some(key=>typeof key!=="string" || !key || key.length>500)) {
      return Promise.reject(new Error("execution.resourceKeys must return at most 100 nonempty resource identities"));
    }
    return new Promise(resolve=>{
      this.waiting.push({keys:[...new Set(raw)].sort(),resolve});
      this.pump();
    });
  }
  private pump(): void {
    const earlier=new Set<string>();
    for(let i=0;i<this.waiting.length && this.active<this.capacity;){
      const item=this.waiting[i]!;
      if(item.keys.some(key=>this.held.has(key) || earlier.has(key))){
        for(const key of item.keys)earlier.add(key);
        i++;continue;
      }
      this.waiting.splice(i,1);this.active++;
      for(const key of item.keys)this.held.add(key);
      let released=false;
      item.resolve(()=>{
        if(released)return;
        released=true;this.active--;
        for(const key of item.keys)this.held.delete(key);
        this.pump();
      });
    }
  }
}
