const s = require('fs').readFileSync('client/src/pages/NovoAluno.tsx', 'utf8');
console.log('open:', /\{\/\* Aulas na Mesma Semana \*\/\r?\n\s*<div className="p-4 bg-primary\/5 border border-primary\/20 rounded-2xl space-y-3">/.test(s));
console.log('recorr label:', /<label className="text-\[10px\] font-black text-muted-foreground uppercase tracking-\[0\.15em\] ml-1">Recorr/.test(s));
console.log('close observ:', /\)\}\r?\n\s*<\/div>\r?\n\s*\{\/\* Observa/.test(s));
const i = s.indexOf('Aulas na Mesma Semana');
const j = s.indexOf('{/* Observa');
console.log('idx aulas:', i, '| idx observa:', j);
