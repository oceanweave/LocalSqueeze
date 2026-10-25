const assert = require('node:assert/strict');
require('ts-node').register({transpileOnly:true,compilerOptions:{module:'commonjs',moduleResolution:'node'}});
const {defaultResizePreferences:defaults, normalizeResizePreferences:normalize, resolveResizePlan:resolve} = require('../src/lib/resize-settings.ts');
const source = {width:400,height:300};
function plan(patch, image=source) { const result=resolve({...defaults,...patch},image);assert.equal(result.error,undefined,result.error);return result; }
function dimensions(patch, expected, image) { const result=plan(patch,image);assert.deepEqual([result.settings.width,result.settings.height],expected);return result; }
dimensions({mode:'photo',presetId:'one-inch'},[295,413]);
dimensions({mode:'photo',presetId:'one-inch',dpi:600},[591,827]);
dimensions({mode:'photo',presetId:'us-visa',dpi:600},[600,600]);
dimensions({mode:'dimensions',width:150,height:200},[150,200]);
dimensions({mode:'dimensions',unit:'cm',physicalWidth:3,physicalHeight:4},[354,472]);
dimensions({mode:'dimensions',unit:'mm',physicalWidth:30,physicalHeight:40},[354,472]);
dimensions({mode:'dimensions',unit:'mm',physicalWidth:30,physicalHeight:40,dpi:600},[709,945]);
for(const [dimensionPolicy,expected] of [['width',[150,113]],['height',[267,200]],['within',[150,113]]]){
 const result=dimensions({mode:'dimensions',width:150,height:200,dimensionPolicy},expected);assert.equal(result.settings.fit,'stretch');assert.equal(result.crop,undefined);
}
dimensions({mode:'dimensions',width:1000,height:1000,dimensionPolicy:'within'},[400,300]);
dimensions({mode:'dimensions',width:0,height:200,dimensionPolicy:'height'},[267,200]);
dimensions({mode:'scale',scalePercent:50},[200,150]);
dimensions({mode:'scale',scalePercent:50},[100,200],{width:200,height:400});
dimensions({mode:'scale',scalePercent:200},[800,600]);
dimensions({mode:'ratio',ratioId:'4:3'},[400,300]);
dimensions({mode:'ratio',ratioId:'16:9'},[400,225]);
dimensions({mode:'ratio',ratioId:'9:16'},[162,288]);
dimensions({mode:'ratio',ratioId:'custom',ratioWidth:5,ratioHeight:4},[375,300]);
dimensions({mode:'ratio',ratioId:'original'},[400,300]);
dimensions({mode:'ratio',ratioId:'16:9',ratioOutput:'width',ratioOutputWidth:1920},[1920,1080]);
const smallCrop=dimensions({mode:'ratio',ratioId:'4:3'},[200,150],{...source,crop:{unit:'%',x:0,y:0,width:50,height:50}});assert.equal(smallCrop.crop.width,50);
for(const patch of [{mode:'dimensions',width:0},{mode:'dimensions',width:1.5},{mode:'dimensions',width:20000,height:20000},{mode:'ratio',ratioId:'custom',ratioHeight:0},{mode:'ratio',ratioOutput:'width',ratioOutputWidth:1.5},{mode:'scale',scalePercent:0},{mode:'scale',scalePercent:401},{dpi:0},{targetEnabled:true,compressionEnabled:true,targetSizeKB:0}]) assert.ok(resolve({...defaults,...patch},source).error,JSON.stringify(patch));
for(const mode of ['ratio','scale']) assert.equal(resolve({...defaults,mode}).needsImage,true);
assert.equal(resolve({...defaults,mode:'dimensions'}).error,undefined);
assert.equal(normalize({presetId:'custom',width:150,height:200}).mode,'dimensions');
assert.equal(normalize({presetId:'one-inch',width:295,height:413}).mode,'photo');
assert.equal(normalize({mode:'ratio',ratioId:'16:9'}).ratioId,'16:9');
assert.equal(normalize({targetEnabled:true}).compressionEnabled,true);
const off=plan({mode:'dimensions',width:150,height:200,targetEnabled:false,targetSizeKB:1});assert.equal(off.settings.targetSizeKB,undefined);
const on=plan({mode:'dimensions',width:150,height:200,compressionEnabled:true,targetEnabled:true,targetSizeKB:200});assert.equal(on.settings.targetSizeKB,200);
console.log('PASS photo, physical units, exact pixels, one-side resize, maximum bounds, aspect ratios, per-image percentages, invalid inputs and old-settings migration');
