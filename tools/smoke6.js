const path = require('path');
const out = process.env.SHOTS || require('os').tmpdir();
const PLAIN = `Set Host header
curl -H "Host: challenge.localhost" http://127.0.0.1/
Save cookies
curl -c cookies.txt http://challenge.localhost/
Send cookies
curl -b cookies.txt http://challenge.localhost/
GET request
python3 -c 'import requests; print(requests.get("http://challenge.localhost/").text)'
Follow-up requests
python3 -c 'import requests; s=requests.Session(); print(s.get("http://challenge.localhost/").text)'
Start challenge server
/challenge/server
Run browser client
/challenge/client
Start HTTP listener
python3 -m http.server 1337 -b 0.0.0.0`;
const MIXED = `Here is how the function works. It adds two numbers.

def add(a, b):
    total = a + b
    return total

Then call it like this and print the result.

const x = add(1, 2);
console.log(x);

That is all you need to know.`;
const HTML = `<h3>Setup</h3><p>Install the package first.</p><pre><div>bash<button>Copy code</button></div><code class="language-bash">npm install express</code></pre><p>Then create a server:</p><pre><code class="language-javascript">const app = require('express')();\napp.listen(3000);</code></pre><ul><li>Open the browser</li></ul>`;
module.exports = async (t) => {
  await t.eval(`BP.newPage(null)`); await t.wait(200);
  const paste = async (text, html) => {
    await t.eval(`(()=>{const p=BP.page(BP.state.current); const nb=BP.newBlock('p',''); p.blocks=[nb]; BP.renderAll(); const el=BP.currentEditor.txtOf(nb.id); BP.editorHelpers.setCaret(el,'start');
      const dt=new DataTransfer(); dt.setData('text/plain', ${JSON.stringify(text)}); ${html ? `dt.setData('text/html', ${JSON.stringify(html)});` : ''}
      el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true})); 0;})()`);
    await t.wait(200);
    return t.eval(`JSON.stringify(BP.page(BP.state.current).blocks.map(b=>b.type==='code'?['CODE:'+b.lang,b.text]:[b.type,BP.textOf(b.text)]))`);
  };
  console.log('1) screenshot content (plain):\n' + (JSON.parse(await paste(PLAIN)).map((x) => '  ' + x[0] + ' | ' + x[1]).join('\n')));
  await t.shot(path.join(out, '20-paste-plain.png'));
  console.log('2) mixed prose+code:\n' + (JSON.parse(await paste(MIXED)).map((x) => '  ' + x[0] + ' | ' + JSON.stringify(x[1])).join('\n')));
  console.log('3) html from a chat site:\n' + (JSON.parse(await paste('Setup\nInstall the package first.\nnpm install express', HTML)).map((x) => '  ' + x[0] + ' | ' + JSON.stringify(x[1])).join('\n')));
  console.log('4) single command line:\n' + JSON.stringify(JSON.parse(await paste('curl -b cookies.txt http://challenge.localhost/'))));
  console.log('5) single normal sentence:\n' + JSON.stringify(JSON.parse(await paste('Remember to buy milk and eggs tomorrow.'))));
  console.log('6) prose with bullets:\n' + JSON.stringify(JSON.parse(await paste('Shopping list\n- milk\n- eggs\n- bread'))));
};
