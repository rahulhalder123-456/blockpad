const TEXT = `Save and resend cookies with -c and -b
request.form is empty
Submit form data using POST, not GET
fetch() returns a Response rather than the flag
Call response.text()
A JavaScript variable is undefined
Python HTTP server reports 404 for /favicon.ico
curl -c -b cookies.txt fails
Supply a filename after each option: -c cookies.txt -b cookies.txt
http:127.0.0.1:80/ fails
Use the proper URL format: http://127.0.0.1:80/
Quick command reference
Basic request
curl -i http://challenge.localhost/
Follow redirects
curl -L http://challenge.localhost/
Create solve page
nano /home/hacker/public_html/solve.html`;
module.exports = async (t) => {
  await t.eval(`BP.newPage(null)`); await t.wait(200);
  await t.eval(`(()=>{const p=BP.page(BP.state.current); const nb=BP.newBlock('p',''); p.blocks=[nb]; BP.renderAll(); const el=BP.currentEditor.txtOf(nb.id); BP.editorHelpers.setCaret(el,'start');
    const dt=new DataTransfer(); dt.setData('text/plain', ${JSON.stringify(TEXT)}); el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true})); 0;})()`);
  await t.wait(200);
  const r = JSON.parse(await t.eval(`JSON.stringify(BP.page(BP.state.current).blocks.map(b=>b.type==='code'?['CODE:'+b.lang,b.text]:[b.type,BP.textOf(b.text)]))`));
  r.forEach((x) => console.log((x[0] + '        ').slice(0, 11) + '| ' + x[1]));
};
