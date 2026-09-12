const test=require('node:test'),assert=require('node:assert/strict');
const data=require('../course-data.js'),core=require('../race-core.js').create(data);
const fix=(km,accuracy=8)=>{const [latitude,longitude]=core.pointAt(km);return {latitude,longitude,accuracy,heading:null,speed:null};};
test('original plan and geometry invariants',()=>{
  assert.equal(data.route.length,414);assert.equal(data.cum.length,414);assert.equal(data.profile.length,85);assert.equal(core.mappedKm,21);
  assert.deepEqual(data.plan.map(p=>p.pace),['5:42','5:43','5:46','5:38','5:35','5:40','5:38','5:34','5:39','5:31','5:40','5:35','5:38','5:42','5:35','5:42','5:30','5:34','5:28','5:20','5:10']);
  let total=0;data.plan.forEach((p,i)=>{total+=p.paceSec;assert.equal(p.cumSec,total);assert.equal(p.start,i);assert.equal(p.end,i+1);});
  let geometryLength=0;
  data.route.slice(1).forEach(([lat,lon],j)=>{const [a,b]=data.route[j],r=Math.PI/180;const dist=12742000*Math.asin(Math.sqrt(Math.sin((lat-a)*r/2)**2+Math.cos(a*r)*Math.cos(lat*r)*Math.sin((lon-b)*r/2)**2));geometryLength+=dist;assert.ok(Math.abs(dist-(data.cum[j+1]-data.cum[j]))<.002);});
  assert.ok(Math.abs(geometryLength-21000)<.001);
  data.kmPoints.forEach((p,i)=>{const j=data.cum.indexOf((i+1)*1000);assert.ok(j>=0);assert.deepEqual(data.route[j],p);assert.deepEqual(core.pointAt(i+1),p);});
});
test('all boundaries and final split calculations',()=>{
  for(let i=1;i<=20;i++){assert.equal(core.index(i-.0001),i-1);assert.equal(core.index(i),i);assert.equal(core.planned(i),data.plan[i-1].cumSec);}
  assert.equal(core.planned(0),0);assert.equal(core.planned(21),7040);assert.ok(Math.abs(core.planned(21.1)-7071)<1e-8);assert.equal(core.planned(100),core.planned(21.1));assert.equal(core.planned(-1),0);
  assert.ok(Math.abs(core.planned(21.05)-7055.5)<1e-8);
});
test('route slices interpolate exact endpoints and never invent final geometry',()=>{
  for(let km=0;km<21;km+=.37){const end=Math.min(21,km+.58),slice=core.slice(km,end);assert.deepEqual(slice[0],core.pointAt(km));assert.deepEqual(slice.at(-1),core.pointAt(end));assert.ok(slice.length>=2);}
  assert.deepEqual(core.pointAt(21.1),data.route.at(-1));
});
test('full 21 km GPS replay every five metres, including shared sections',()=>{
  let previous={meters:0,time:100000},maxError=0;
  for(let m=0;m<=21000;m+=5){const time=100000+m/3*1000,result=core.match(fix(m/1000),previous,time);assert.ok(result.accepted,`at ${m}: ${result.reason}`);maxError=Math.max(maxError,Math.abs(result.meters-m));assert.ok(Math.abs(result.meters-m)<20,`jump at ${m}: ${result.meters}`);previous={meters:result.meters,time};}
  console.log('Full replay maximum error (m):',maxError.toFixed(3));
});
test('noisy GPS replay does not jump between shared course branches',()=>{
  let previous={meters:0,time:100000},rejected=0,maxError=0;
  for(let m=0;m<=21000;m+=10){const time=100000+m/3*1000,c=fix(m/1000,15);c.latitude+=Math.sin(m*1.31)*.00004;c.longitude+=Math.cos(m*.71)*.00007;const result=core.match(c,previous,time);if(!result.accepted){rejected++;continue;}maxError=Math.max(maxError,Math.abs(result.meters-m));assert.ok(Math.abs(result.meters-m)<80,`jump at ${m}: ${result.meters}`);previous={meters:result.meters,time};}
  assert.ok(rejected<100);console.log('Noisy replay:',{maxError,rejected});
});
test('rejects poor accuracy, off-course fixes, stale-distance jumps; allows backward movement',()=>{
  const previous={meters:6000,time:100000};assert.equal(core.match(fix(6,100),previous,101000).accepted,false);
  assert.equal(core.match(fix(17),previous,101000).accepted,false);
  const off=core.match({latitude:61,longitude:25,accuracy:5},previous,101000);assert.equal(off.accepted,false);assert.equal(off.far,true);
  const back=core.match(fix(5.98),previous,110000);assert.ok(back.accepted);assert.ok(back.meters<5990);
  assert.equal(core.match({latitude:NaN,longitude:25,accuracy:5},previous,101000).accepted,false);
});
test('ambiguous initial shared section holds; manual seed permits correct branch',()=>{
  assert.equal(core.match(fix(20.98),null,100000).accepted,false);
  for(const km of [0.9,6.98,17.49,20.98]){const result=core.match(fix(km),{meters:Math.floor(km)*1000,time:100000,seed:true},101000);assert.ok(result.accepted,`${km}: ${result.reason}`);assert.ok(Math.abs(result.meters-km*1000)<10);}
});
