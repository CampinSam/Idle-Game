// Run against the local development-only mission-pilot.html fixture, with Vite on port 15000.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import fs from 'node:fs';
const output = process.env.MISSION_EVIDENCE_DIR || '/tmp/mission-pilot-evidence';
fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const results=[];
async function checkDialogScroll(page, stage) {
 const result = await page.getByRole('dialog').evaluate(dialog => {
  const owners = [dialog, ...dialog.querySelectorAll('*')].filter(e =>
   ['auto', 'scroll'].includes(getComputedStyle(e).overflowY) && e.clientHeight > 0);
  const overflowing = owners.filter(e => e.scrollHeight > e.clientHeight + 2);
  const scrollable = overflowing.every(e => {
   e.scrollTop = e.scrollHeight;
   const moved = e.scrollTop > 0;
   e.scrollTop = 0;
   return moved;
  });
  return { owners: owners.length, overflowing: overflowing.length, scrollable,
   horizontalOverflow: dialog.scrollWidth > dialog.clientWidth + 2 || document.documentElement.scrollWidth > innerWidth };
 });
 if(result.owners !== 1 || result.overflowing > 1 || !result.scrollable || result.horizontalOverflow)
  throw new Error(`${stage} scroll ownership: ${JSON.stringify(result)}`);
 return result;
}
try {
for (const [width,height,phases] of [[320,720,2],[390,844,1],[844,390,2]]) {
 const page=await browser.newPage({viewport:{width,height},hasTouch:true});
 const errors=[]; const unexpected=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='127.0.0.1'){unexpected.push(url.origin);return route.abort();}
  if(url.pathname.startsWith('/api')){unexpected.push(url.pathname);return route.fulfill({status:500,body:'Unexpected API call'});}
  if(url.pathname.startsWith('/media'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#514478"/></svg>'});
  return route.continue();
 });
 await page.goto(`http://127.0.0.1:15000/mission-pilot.html?phases=${phases}`);
 await page.getByText('Field research',{exact:true}).click();
 await page.getByText('Survey the crystal marsh',{exact:true}).click();
 await page.getByRole('button',{name:'AUTO BUILD TEAM'}).click();
 const start=page.getByRole('button',{name:/START MISSION/});
 await start.scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('START MISSION'))?.disabled);
 const scrolls=await page.evaluate(()=>Array.from(document.querySelectorAll('*')).filter(e=>['auto','scroll'].includes(getComputedStyle(e).overflowY)&&e.scrollHeight>e.clientHeight+2).map(e=>e.className));
 if(scrolls.length!==1)throw new Error(`Expected one mission scroller, got ${JSON.stringify(scrolls)}`);
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Horizontal overflow');
 await page.screenshot({path:`${output}/planning-${width}x${height}.png`});
 await page.evaluate(()=>window.missionPilot.balance());
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('START MISSION'))?.disabled);
 await page.evaluate(()=>window.missionPilot.balance());
 await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('START MISSION'))?.disabled);
 await start.click();
 await page.getByRole('dialog').waitFor();
 const timer=page.locator('.gm-timer-value');
 const before=await timer.innerText();
 await page.waitForTimeout(1300);
 if(before===await timer.innerText())throw new Error('Timer did not advance');
 await page.evaluate(()=>{document.dispatchEvent(new Event('visibilitychange'));window.missionPilot.reconnect();});
 await page.waitForTimeout(500);
 await page.evaluate(()=>window.missionPilot.advance());
 let decisionScroll = null;
 if(phases===2){
  await page.getByRole('heading',{name:'Choose the next phase'}).waitFor();
  decisionScroll = await checkDialogScroll(page, 'decision');
  await page.screenshot({path:`${output}/decision-${width}x${height}.png`});
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('heading',{name:'Survey in progress — phase 2'}).waitFor();
  await page.evaluate(()=>window.missionPilot.advance());
 }
 await page.getByRole('heading',{name:'Mission ready'}).waitFor();
 await page.getByRole('button',{name:'Collect',exact:true}).click();
 await page.getByRole('heading',{name:'Field report: earned 10 crystals'}).waitFor();
 const resultScroll = await checkDialogScroll(page, 'result');
 await page.screenshot({path:`${output}/result-${width}x${height}.png`});
 await page.keyboard.press('Tab');
 const focusInDialog=await page.evaluate(()=>!!document.activeElement?.closest('[role=dialog]'));
 if(!focusInDialog)throw new Error('Focus escaped dialog');
 await page.evaluate(()=>window.missionPilot.reconnect()); await page.waitForTimeout(300);
 if(await page.getByRole('heading',{name:'Field report: earned 10 crystals'}).count()!==1)throw new Error('Historical report changed');
 const starts=await page.evaluate(()=>window.missionPilot.startCount);
 if(starts!==1||errors.length||unexpected.length)throw new Error(JSON.stringify({starts,errors,unexpected}));
 results.push({width,height,phases,scrollOwners:scrolls.length,decisionScroll,resultScroll,starts,timerAdvanced:true,focusContained:focusInDialog,errors,unexpected});
 await page.close();
}
} finally { await browser.close(); fs.writeFileSync(`${output}/results.json`,JSON.stringify(results,null,2)); }
console.log(JSON.stringify(results,null,2));
