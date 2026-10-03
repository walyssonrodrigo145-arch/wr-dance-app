// seed_demo_loja_eventos.js — Produtos da Loja + Eventos de demonstração
// (org 1 / escola modelo dancepro@gmail.com), com fotos Unsplash, programa
// de coreografias, participações por turma e vendas no evento realizado.
//
// Idempotente: aborta se já houver produtos DEM-* ou eventos [DEMO].
// Uso: $env:VPS_PASSWORD='...'; node vps-script/seed_demo_loja_eventos.js
const { Client } = require("ssh2");
const fs = require("fs");

const sql = `
BEGIN;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM costumes WHERE "organizationId"=1 AND code LIKE 'DEM-%')
  THEN RAISE EXCEPTION 'Seed da Loja ja aplicado (abortando para nao duplicar).';
  END IF;
END $$;

-- ═══════════════════════ 1) PRODUTOS DA LOJA ═══════════════════════
INSERT INTO costumes ("organizationId","createdByUserId",name,code,type,size,color,quantity,condition,cost,"salePrice","promoPrice",sellable,"photoUrl",notes)
VALUES
 (1,1,'Collant Infantil Rosa','DEM-COL-001','collant','P','Rosa',24,'novo',38.00,89.90,NULL,true,'https://images.unsplash.com/photo-1596460107916-430662021049?w=800&q=80','Tecido com microfibra — aula e apresentação.'),
 (1,1,'Camiseta DancePro','DEM-CAM-002','uniforme','M','Preto',40,'novo',22.00,69.90,NULL,true,'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&q=80','Uniforme oficial da escola — algodão pente 30.1.'),
 (1,1,'Garrafa Personalizada 750ml','DEM-GAR-003','acessorio','Único','Inox',25,'novo',18.00,49.90,NULL,true,'https://images.unsplash.com/photo-1602143407151-7111542de6e8?w=800&q=80','Inox parede dupla — gravação a laser incluso.'),
 (1,1,'Saia de Ensaio Tutu','DEM-SAI-004','saia','M','Preto',15,'novo',45.00,79.90,NULL,true,'https://images.unsplash.com/photo-1562832131-14ca1c02f218?w=800&q=80','Tutu de tule com cintura elástica.'),
 (1,1,'Bolsa de Dança Grande','DEM-BOL-005','acessorio','G','Rosa',18,'novo',62.00,129.90,NULL,true,'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=800&q=80','Bolsa esportiva com divisor para sapatilhas.'),
 (1,1,'Tênis de Jazz','DEM-TEN-006','sapatilha','38','Preto',22,'novo',78.00,159.90,NULL,true,'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=800&q=80','Sola flexível — jazz e técnicas mistas.'),
 (1,1,'Meia Altura Ballet (-kit 3)','DEM-MEI-007','acessorio','P','Branco',50,'novo',9.00,29.90,NULL,true,'https://images.unsplash.com/photo-1583416750470-865030346874?w=800&q=80','Pacote com 3 pares, reforço no calcanhar.'),
 (1,1,'Faixa de Cabelo Strass','DEM-FAI-008','acessorio','Único','Branco',45,'novo',6.00,24.90,NULL,true,'https://images.unsplash.com/photo-1588444837495-c6cfeb53f32d?w=800&q=80','Presilha com strass — recital e competições.'),
 (1,1,'Sapatilha de Pontas Profissional','DEM-PON-009','sapatilha','37','Rosa',12,'novo',210.00,489.90,NULL,true,'https://images.unsplash.com/photo-1595545237208-45b098458aff?w=800&q=80','Palmilha reforçada — uso profissional.'),
 (1,1,'Kit Elásticos (5 un)','DEM-ELA-010','acessorio','Único','Sortido',60,'novo',4.50,19.90,NULL,true,'https://images.unsplash.com/photo-1606760227091-3ddcc70abb53?w=800&q=80','Elásticos grossos para coque firm.'),
 (1,1,'Mochila DancePro Teen','DEM-MOC-011','acessorio','Único','Rosa',20,'novo',85.00,189.90,139.90,true,'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=800&q=80','Bolso térmico e porta-sapatilhas.'),
 (1,1,'Almofada de Pontas (Turn Pad)','DEM-PAD-012','acessorio','Único','Rosa',30,'novo',25.00,59.90,44.90,true,'https://images.unsplash.com/photo-1520639888713-7851133b1ed0?w=800&q=80','Pad de gel para pontas.'),
 (1,1,'Workshop de Verano — Ingresso','DEM-CUR-013','outro','Único','—',80,'novo',0.00,149.90,NULL,true,'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=800&q=80','Ingresso do workshop com convidado especial.'),
 (1,1,'Avental de Ensaio Infantil','DEM-AVE-014','outro','P','Rosa',35,'novo',32.00,74.90,NULL,true,'https://images.unsplash.com/photo-1518049362265-d5b2a6467637?w=800&q=80','Avental tutu estampado — turmas Baby.');

-- ════════════════════════════ 2) EVENTOS ════════════════════════════
INSERT INTO events ("organizationId","createdByUserId",name,type,description,"venueName","venueAddress","startsAt","endsAt",status,"requiresAuthorization","photoUrl")
VALUES
 (1,1,'Recital de Fim de Ano [DEMO]','recital',
  U&'\\002413'' Concentração 90 min antes. Figurino conforme guia da Loja. Cada aluna recebe 2 ingressos de cortesia.',
  'Teatro Municipal', 'Praça da Matriz, 12 — Centro',
  (SELECT date_trunc('day', now()) + interval '21 days 19 hours'),
  (SELECT date_trunc('day', now()) + interval '21 days 22 hours'),
  'confirmado', true,
  'https://images.unsplash.com/photo-1508700929628-666bc8bd84ea?w=1200&q=80'),
 (1,1,'Festival de Inverno [DEMO]','festival',
  'Dois dias de mostra com oficinas, batalha de grupos e coreografias convidadas.',
  'Centro Cultural', 'Av. Rio Branco, 245 — Centro',
  (SELECT date_trunc('day', now()) + interval '40 days 14 hours'),
  (SELECT date_trunc('day', now()) + interval '41 days 22 hours'),
  'confirmado', true,
  'https://images.unsplash.com/photo-1547153760-18fc86324498?w=1200&q=80'),
 (1,1,'Workshop de Verano [DEMO]','workshop',
  'Workshop intensivo com bailarino convidado — publicação em breve, vagas por turma.',
  'Sala de Ensaios 1', 'Rua das Figueiras, 250 — Sede',
  (SELECT date_trunc('day', now()) + interval '90 days 10 hours'),
  (SELECT date_trunc('day', now()) + interval '90 days 17 hours'),
  'planejado', false,
  'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=1200&q=80'),
 (1,1,'Mostra de Meio de Ano [DEMO] (realizado)','recital',
  'Apresentação interna de meio de ano com todas as turmas + vernissage de fotos.',
  'Auditório Municipal', 'Rua das Acácias, 90',
  (SELECT date_trunc('day', now()) - interval '75 days 19 hours'),
  (SELECT date_trunc('day', now()) - interval '75 days 22 hours')  ,
  'realizado', true,
  'https://images.unsplash.com/photo-1519677100203-a0e372c96dce?w=1200&q=80'),
 (1,1,'Competição Intermunicipal [DEMO] (cancelado)','competicao',
  'Cancelado pelo organizador externo — mantido para histórico.',
  'Clube Estação', 'Av. Beira Mar, 1100',
  (SELECT date_trunc('day', now()) - interval '40 days 13 hours'),
  (SELECT date_trunc('day', now()) - interval '40 days 20 hours'),
  'cancelado', true,
  'https://images.unsplash.com/photo-1514320291840-2e0a9f3a53c0?w=1200&q=80');

-- ═════════════ 3) COREOGRAFIAS + PROGRAMA (ordem de apresentação) ═════════════
INSERT INTO coreografias ("organizationId","createdByUserId",title,"modalidadeId",nivel,formacao,musica,status)
SELECT 1, 1, v.title, v.mid, v.nivel, v.formacao, v.mus, v.status
FROM (VALUES
  ('Abertura — Grand Waltz [DEMO]',        1,  'todas',      'grupo', 'Waltz of the Flowers (Tchaikovsky)', 'pronta'),
  ('Baby — Primeiros Passos [DEMO]',       1,  'iniciante',  'grupo', 'Waltz of the Snowflakes',            'pronta'),
  ('Jazz Teen — Street Fusion [DEMO]',     22, 'intermediario','grupo','Uptown Funk',                        'pronta'),
  ('Contemporâneo — Respirar [DEMO]',      23, 'intermediario','grupo','Divenire (Ludovico Einaudi)',        'pronta'),
  ('Hip Hop Kids — Batalha Legal [DEMO]',  24, 'iniciante',  'grupo', 'Jump Around',                        'em_montagem'),
  ('K-Pop — Cover Season [DEMO]',          26, 'intermediario','grupo','Show Must Go On (K-Pop medley)',     'pronta'),
  ('Ventre — Oriental Dream [DEMO]',       25, 'intermediario','solo', 'Enta Omri',                          'pronta'),
  ('Ballet Juvenil — Sinfonia [DEMO]',     1,  'avancado',   'grupo', 'Sinfonia nº 5 (Beethoven)',          'pronta')
) AS v(title, mid, nivel, formacao, mus, status)
WHERE NOT EXISTS (SELECT 1 FROM coreografias WHERE "organizationId"=1 AND title=v.title);

INSERT INTO event_choreographies ("organizationId","eventId","coreografiaId",ordem)
SELECT 1, e.id, c.id, v.ord
FROM (VALUES
  ('Recital de Fim de Ano [DEMO]',           'Baby — Primeiros Passos',          1),
  ('Recital de Fim de Ano [DEMO]',           'Jazz Teen — Street Fusion',        2),
  ('Recital de Fim de Ano [DEMO]',           'Contemporâneo — Respirar',         3),
  ('Recital de Fim de Ano [DEMO]',           'Hip Hop Kids — Batalha Legal',     4),
  ('Recital de Fim de Ano [DEMO]',           'K-Pop — Cover Season',             5),
  ('Recital de Fim de Ano [DEMO]',           'Abertura — Grand Waltz',           6),
  ('Festival de Inverno [DEMO]',             'Contemporâneo — Respirar',         1),
  ('Festival de Inverno [DEMO]',             'Ventre — Oriental Dream',          2),
  ('Festival de Inverno [DEMO]',             'Ballet Juvenil — Sinfonia',        3),
  ('Mostra de Meio de Ano [DEMO] (realizado)','Baby — Primeiros Passos',         1),
  ('Mostra de Meio de Ano [DEMO] (realizado)','Jazz Teen — Street Fusion',       2),
  ('Mostra de Meio de Ano [DEMO] (realizado)','Hip Hop Kids — Batalha Legal',    3)
) AS v(eventTitle, coreoTitle, ord)
JOIN events e ON e.name = v.eventTitle AND e."organizationId" = 1
JOIN coreografias c ON c.title = v.coreoTitle || ' [DEMO]' AND c."organizationId" = 1
ON CONFLICT DO NOTHING;

-- ═════════════ 4) PARTICIPAÇÕES por turma (convidado/confirmado/recusado) ═════════════
INSERT INTO event_participants ("organizationId","eventId","studentId",status,"imageAuthorization","participationAuthorization","guardianName","confirmedAt")
SELECT 1, e.id, ta."studentId", v.st, v.img, v.part, s."guardianName",
       CASE WHEN v.st = 'confirmado' THEN now() - interval '2 days' ELSE NULL END
FROM (VALUES
  ('Recital de Fim de Ano [DEMO]',            'Ballet Baby (2 a 4 anos)', 'confirmado', true,  true),
  ('Recital de Fim de Ano [DEMO]',            'Ballet Infantil I',        'convidado',  false, false),
  ('Recital de Fim de Ano [DEMO]',            'Jazz Teen',                'confirmado', true,  true),
  ('Festival de Inverno [DEMO]',              'Contemporâneo Intermediário','confirmado', true,  false),
  ('Festival de Inverno [DEMO]',              'Dança do Ventre',         'recusado',   false, false),
  ('Mostra de Meio de Ano [DEMO] (realizado)','Ballet Juvenil',           'confirmado', true,  true),
  ('Mostra de Meio de Ano [DEMO] (realizado)','Hip Hop Kids',             'confirmado', true,  true)
) AS v(eventTitle, turma, st, img, part)
JOIN events e ON e.name = v.eventTitle AND e."organizationId" = 1
JOIN turmas t ON t.name = v.turma AND t."organizationId" = 1
JOIN turma_alunos ta ON ta."turmaId" = t.id AND ta."studentId" IS NOT NULL
JOIN students s ON s.id = ta."studentId" AND s."organizationId" = 1
ON CONFLICT DO NOTHING;

-- ═════════════ 5) VENDAS no evento realizado (2 pagas + 1 pendente) ═════════════
INSERT INTO costume_sales ("organizationId","costumeId","studentId","eventId",quantity,"unitPrice","totalPrice","paymentMode","discountPercent","madeToOrder",status,"notes","createdByUserId")
SELECT 1, c.id, s.id, e.id, v.qty, ROUND(c."salePrice" * (1 - v.disc / 100.0), 2), ROUND(c."salePrice" * (1 - v.disc / 100.0), 2) * v.qty, v.pm, v.disc, false, v.st, 'Venda de demonstração (seed)', 1
FROM (VALUES
  ('Camiseta DancePro',            'Mostra de Meio de Ano [DEMO] (realizado)', 0,  'avulso',      'pago',     1, 1),
  ('Collant Infantil Rosa',        'Mostra de Meio de Ano [DEMO] (realizado)', 10, 'mensalidade', 'pago',     1, 2),
  ('Garrafa Personalizada 750ml',  'Mostra de Meio de Ano [DEMO] (realizado)', 0,  'avulso',      'pendente', 1, 3)
) AS v(prodname, eventTitle, disc, pm, st, qty, ord)
JOIN costumes c ON c.name = v.prodname AND c."organizationId" = 1
JOIN events e ON e.name = v.eventTitle AND e."organizationId" = 1
JOIN LATERAL (SELECT id, "guardianName" FROM students WHERE "organizationId" = 1 AND email LIKE '%@demo.dancepro.app' ORDER BY id OFFSET (v.ord - 1) LIMIT 1) s ON true;

-- orderCode determinístico (VDA-{1000+id}) para as vendas sem código
UPDATE costume_sales SET "orderCode" = 'VDA-' || (1000 + id) WHERE "orderCode" IS NULL;

COMMIT;
`;

// Corrige nomes com typo acidental (proteçãocontra drift)
const fixed = sql
  .replace(/U&'\\002413''/g, "'")
  .replace(/Ventre|Ventre/g, "Ventre")
  .replace(/firm/g, "firm")
  .replace(/Grand Waltz/g, "Grand Valse");

const conn = new Client();
conn.on("ready", () => {
  const local = "C:\\Users\\walysson\\AppData\\Local\\Temp\\opencode\\seed_loja.sql";
  fs.writeFileSync(local, fixed, "utf8");
  conn.sftp((err, sftp) => {
    if (err) throw err;
    sftp.fastPut(local, "/tmp/seed_loja.sql", (e2) => {
      if (e2) throw e2;
      const cmd = "docker cp /tmp/seed_loja.sql dance-db:/tmp/seed_loja.sql >/dev/null 2>&1 && docker exec dance-db sh -c 'psql -U $POSTGRES_USER -d $POSTGRES_DB -v ON_ERROR_STOP=1 -f /tmp/seed_loja.sql'";
      conn.exec(cmd, (err2, stream) => {
        if (err2) throw err2;
        let out = "";
        stream.on("data", (d) => { out += d.toString(); });
        stream.stderr.on("data", (d) => { out += d.toString(); });
        stream.on("close", (code) => {
          console.log(out);
          console.log(code === 0 ? "SEED OK" : `SEED FALHOU (code ${code})`);
          conn.end();
        });
      });
    });
  });
}).connect({ host: "179.197.76.174", port: 22, username: "root", password: process.env.VPS_PASSWORD || "Walysson2003@", readyTimeout: 30000 });
