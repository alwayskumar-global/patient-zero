/** Binary heap for chronologically processing signal-strength events. */
export class PriorityQueue<T> {
 private readonly values:T[]=[];
 constructor(private readonly compare:(a:T,b:T)=>number){}
 get length():number{return this.values.length;}
 push(value:T):void{
  this.values.push(value);let i=this.values.length-1;
  while(i>0){const parent=Math.floor((i-1)/2);if(this.compare(this.values[parent]!,value)<=0)break;this.values[i]=this.values[parent]!;i=parent;}
  this.values[i]=value;
 }
 pop():T|undefined{
  const first=this.values[0],last=this.values.pop();if(this.values.length===0)return first;
  let i=0;this.values[0]=last!;
  while(i*2+1<this.values.length){let child=i*2+1;
   if(child+1<this.values.length&&this.compare(this.values[child+1]!,this.values[child]!)<0)child++;
   if(this.compare(this.values[i]!,this.values[child]!)<=0)break;
   [this.values[i],this.values[child]]=[this.values[child]!,this.values[i]!];i=child;
  }
  return first;
 }
}
