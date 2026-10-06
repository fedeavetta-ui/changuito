// Reglas de la compra mensual (portadas del relevador original de Changuito Rosario).
// Cada ítem: [id, búsquedas, debe contener, excluir, objetivos [[cantidad, unidad]]]
const X = s => new RegExp(s, 'i');
const ITEMS = [
 ["aceite_gir",["aceite girasol 1,5","aceite girasol 1.5"],X("girasol"),X("mezcla|alto oleico|spray|900|500 ?ml"),[[1500,"ml"]]],
 ["aceite_oliva",["aceite oliva 500","aceite de oliva"],X("^aceite.*oliva"),X("spray|mezcla|aceto|aceitun|pisos|jab[oó]n|mayonesa"),[[500,"ml"]]],
 ["arroz",["arroz largo fino 1 kg"],X("arroz"),X("integral|yaman|parboil|listo|preparad|galleta|harina|basmati|jazm|carnaroli|doble|aritos|snack|bebida|leche"),[[1000,"g"]]],
 ["fideos",["fideos 500"],X("fideo|spaghetti|tirabuz|mostachol|tallar|codito|codos|moñito|munici|guiser"),X("arroz|integral|sin tacc|huevo|libre de gluten|legumbre|sopa|caldo"),[[500,"g"]]],
 ["harina",["harina 000 1 kg"],X("harina"),X("0000|leudante|integral|ma[ií]z|arroz|garbanzo|almendra|pizza|preme|polenta"),[[1000,"g"]]],
 ["polenta",["polenta 500"],X("polenta"),X("lista|snack"),[[500,"g"]]],
 ["avena",["avena arrollada","avena tradicional","avena"],X("avena"),X("barra|granola|bebida|leche|galle|box|cereal|chips"),[[500,"g"]]],
 ["lentejas",["lentejas"],X("lenteja"),X("sopa|guiso|harina|lentej[oó]n"),[[400,"g"]]],
 ["garbanzos",["garbanzos"],X("garbanzo"),X("harina|humm"),[[400,"g"]]],
 ["pure_tomate",["pure de tomate 520","pure de tomate"],X("pur[eé] de tomate|pur[eé] tomate"),X("salsa"),[[520,"g"]]],
 ["atun",["atun 170","atun"],X("at[uú]n"),X("ensalada|pat[eé]|gato|perro"),[[170,"g"]]],
 ["azucar",["azucar 1 kg","azucar comun"],X("az[uú]car"),X("impalpable|mascabo|light|org[aá]nica|edulcor|rubia|negra|stevia|sin az|mermelada|gaseosa|bebida|agua|chicle|caramel"),[[1000,"g"]]],
 ["sal",["sal fina 500","sal fina"],X("\\bsal\\b"),X("gruesa|parrill|condimentada|marina|light|rosada|hierbas|baja|hierro|aderezo|sales"),[[500,"g"]]],
 ["yerba",["yerba mate 1 kg","yerba 1kg"],X("yerba"),X("compuesta|saquito|hierbas|naranja|lim[oó]n|mate cocido|termo|mate de"),[[1000,"g"]]],
 ["cafe",["cafe molido 250"],X("caf[eé]"),X("instant|c[aá]psul|grano|sol[uú]ble|torrado|capuchino|cappuccino|leche|con az"),[[250,"g"]]],
 ["te",["te saquitos 50","te negro saquitos"],X("^t[eé]\\b|\\bt[eé] "),X("verde|frut|hierbas|manzanilla|mate cocido|boldo|rooibos|matcha|frio|helado|tilo|menta|peperina|earl|lady|chai|rojo"),[[50,"u"]]],
 ["galletitas",["galletitas crackers","galletitas de agua"],X("cracker|de agua|criollitas"),X("integral|salvado|semilla|sin sal|mini|tostada|cebolla|cereal|queso|dulce|chips|avena"),[[300,"g"]]],
 ["mermelada",["mermelada 390"],X("mermelada"),X("light|diet|sin az"),[[390,"g"]]],
 ["mayonesa",["mayonesa 500"],X("mayonesa"),X("light|vegana|sabor|bajo lip|lim[oó]n|ajo"),[[500,"g"]]],
 ["vinagre",["vinagre alcohol 500","vinagre de alcohol"],X("vinagre"),X("bals[aá]mico|aceto|manzana|vino|jerez"),[[500,"ml"]]],
 ["caldo",["caldo cubos","caldo verdura"],X("caldo"),X("sopa|polvo|gel|light|reducido|cero|menos sodio|balance|l[ií]quido"),[[114,"g"],[12,"u"]]],
 ["leche",["leche entera 1 l","leche entera"],X("leche"),X("polvo|descremada|parcial|chocolat|sin lactosa|almendra|soja|coco|avena|condensada|vegetal|cabra|dulce|multidefensa|2%|1%|zero"),[[1000,"ml"]]],
 ["yogur",["yogur natural","yogur natural 1 kg"],X("yog"),X("frut|cereal|griego|vainilla|frutilla|durazno|ar[aá]ndano|banana|mango|anan[aá]|cereza|chocolate|dulce"),[[1000,"g"]]],
 ["queso_cremoso",["queso cremoso"],X("cremoso|port salut|cuartirolo"),X("rallado|untable|light|feteado|saborizado|yogur|helado|procesado"),[[1,"kg"]]],
 ["queso_rallado",["queso rallado"],X("queso.*rallado|rallado.*queso"),X("pan rallado|light|coco|zanahoria|rallador|alimento|procesado|deshidrat|aderezo"),[[120,"g"]]],
 ["manteca",["manteca 200"],X("manteca"),X("man[ií]|cacao|light|sin sal|untable|karit"),[[200,"g"]]],
 ["huevos",["huevos 30","huevos"],X("huevo"),X("codorniz|pascua|chocolate|polvo|l[ií]quido|organizador|mayonesa|fideo|kinder"),[[30,"u"]]],
 ["carne_picada",["carne picada comun","carne picada"],X("picada"),X("especial|magra|cerdo|pollo|vegetal|nalga|cuadrada|premezcla|frutos|queso|congelad"),[[1,"kg"]]],
 ["pollo",["pollo entero"],X("pollo"),X("ravioles|sorrentin|pasta|tapa|pata|muslo|pechuga|suprema|milanesa|alita|bocadito|nugget|hamburgues|caldo|trozado|arroz|medall|rotis|rostiz|cocido|gato|perro|alimento|cuarto|1/4|sabor|salchicha|empanada"),[[1,"kgx"]]],
 ["milanesas",["nalga milanesa","milanesa de nalga","nalga"],X("nalga"),X("pollo|soja|vegetal|rebozad|congelad|cerdo|merluza|pescado|calabaza|espinaca|lenteja|picada|sin gluten"),[[1,"kg"]]],
 ["papa",["papa x kg","papa negra","papa"],X("^papas? "),X("frita|pur[eé]|bast[oó]n|congelad|chips|noisette|r[uú]stica|baby|dulce|lay|pringles|croqueta|al horno|crema|tortilla|mix|corte"),[[1,"kgx"]]],
 ["cebolla",["cebolla x kg","cebolla"],X("^cebolla"),X("morada|verdeo|pickle|deshidrat|polvo|aros|escamas"),[[1,"kgx"]]],
 ["tomate",["tomate redondo","tomate x kg"],X("^tomate"),X("perita|cherry|pur[eé]|lata|triturado|seco|salsa|ketchup|pulpa|pelado"),[[1,"kgx"]]],
 ["zanahoria",["zanahoria x kg","zanahoria"],X("^zanahoria"),X("rallada|baby|congelad|jugo|deshidrat|cubos|ensalada|semilla|vac[ií]o"),[[1,"kgx"]]],
 ["lechuga",["lechuga x kg","lechuga"],X("^lechuga"),X("mix|bolsa|baby|hidrop|semilla|morada|viva|crispy"),[[1,"kgx"]]],
 ["zapallo",["zapallo x kg","zapallo"],X("^zapall|^calabaza|^anco"),X("congelad|cubos|pur[eé]|semilla"),[[1,"kgx"]]],
 ["banana",["banana x kg","banana"],X("^banana|^pl[aá]tano"),X("chips|deshidrat|yogur|bebida|licuado|barra|dulce"),[[1,"kgx"]]],
 ["manzana",["manzana x kg","manzana"],X("^manzana"),X("jugo|vinagre|sidra|pur[eé]|deshidrat|barra|compota|dulce|bebida|yogur|polvo|verde"),[[1,"kgx"]]],
 ["naranja",["naranja x kg","naranja"],X("^naranja"),X("jugo|bebida|gaseosa|mermelada|polvo|sabor|dulce|agua"),[[1,"kgx"]]],
 ["detergente",["detergente 750"],X("detergente"),X("ropa|lavarrop|lavavaj|pastilla|polvo|repuesto"),[[750,"ml"]]],
 ["lavandina",["lavandina 2 l","lavandina"],X("lavandina|cloro"),X("gel|ropa|aditiv|perfum|pastilla"),[[2000,"ml"]]],
 ["jabon_ropa",["jabon liquido ropa 3 l","jabon liquido para ropa"],X("jab[oó]n l[ií]quido|l[ií]quido.*ropa|jab[oó]n.*ropa"),X("suaviz|c[aá]psula|polvo|concentrado|diluir|fina|oscura|beb[eé]|woolite"),[[3000,"ml"]]],
 ["limpiapisos",["limpiador pisos 900","limpiador liquido pisos"],X("limpiador|pisos"),X("repuesto|cera|plastific|mopa|trapo|ba[ñn]o|vidrio|cocina|desengras|antigrasa|acondicionador"),[[900,"ml"]]],
 ["esponjas",["esponja cocina","esponja"],X("esponja"),X("acero|lana|corporal|ba[ñn]o|maquillaje|bronce|pa[ñn]o|x ?[2-9]\\b|[2-9] ?u"),[[1,"any"]]],
 ["bolsas",["bolsas residuo","bolsas de residuos"],X("bolsa"),X("consorcio|perfum|tacho|freezer|hermétic|herm[eé]tic|compras|camiseta"),[[20,"u"]]],
 ["rollo_cocina",["rollo de cocina"],X("rollo"),X("dispenser|higi[eé]nico|aluminio|film|papel manteca"),[[3,"u"]]],
 ["papel_hig",["papel higienico simple","papel higienico 12"],X("papel higi[eé]nico"),X("h[uú]medo|doble|80 ?m|100 ?m|50 ?m"),[[12,"u"]]],
 ["jabon",["jabon tocador","jabon de tocador"],X("jab[oó]n"),X("l[ií]quido|ropa|pan de|polvo|repuesto|dermo|[ií]ntimo|beb[eé]|pack|x ?3|3 ?x|tripack|kids|ni[ñn]os|glicerina"),[[1,"any"]]],
 ["shampoo",["shampoo 400"],X("shamp"),X("beb[eé]|baby|ni[ñn]os|kids|anticaspa|repuesto|seco|pack|perro|gato"),[[400,"ml"]]],
 ["acondicionador",["acondicionador 400"],X("acondic"),X("beb[eé]|baby|ni[ñn]os|kids|repuesto|pack|ropa|suaviz|pisos"),[[400,"ml"]]],
 ["pasta_dental",["pasta dental 90","crema dental 90"],X("pasta dental|crema dental|dent[ií]frico"),X("ni[ñn]os|kids|pack|cepillo|sensitive|carb|x ?2|2 ?x"),[[90,"g"]]],
 ["desodorante",["desodorante aerosol"],X("desodorante|antitranspirante"),X("pie|calzado|ambiente|roll|barra|crema|pack|clinical|air|auto"),[[150,"ml"]]],
];

// ---- tamaño / unidad desde el nombre ----
const num = s => parseFloat(String(s).replace(',', '.'));
function sizes(name){
  const n = name.toLowerCase().replace(/\s+/g,' ');
  const out = {};
  let m;
  const wre = /(\d+(?:[.,]\d+)?)\s*(kgm?|kilos?|grs?|grm|gramos|g)\b\.?/g;
  while ((m = wre.exec(n))){ const v = num(m[1]); out.g = /^k/.test(m[2]) ? v*1000 : v; }
  const vre = /(\d+(?:[.,]\d+)?)\s*(ltrs?|lts?|litros?|l|ml|cc|cmq|cm3)\b\.?/g;
  while ((m = vre.exec(n))){ const v = num(m[1]); out.ml = /^(ml|cc|cmq|cm3)$/.test(m[2]) ? v : v*1000; }
  const cre = /(?:\bx\s*(\d+)\b(?!\s*(?:m|mts|metros|cm|g|gr|grs|kg|ml|l|lt|lts|cc)\b))|(?:\b(\d+)\s*(?:u|un|uni|unid|unidades|ud|uds|rollos|saquitos|saq|paños|panos|cubos)\b\.?)/g;
  while ((m = cre.exec(n))){ out.u = parseInt(m[1]||m[2]); }
  return out;
}
const isKg = (name, mu) => mu === 'kg' || /\bx ?(1 ?)?kg\b|por kg|x kilo|\bkg\.?$|xkg/i.test(name);

function normalize(name, price, list, targets, mu){
  for (const [amt, unit] of targets){
    if (unit === 'any') return [price, list];
    if (unit === 'kgx'){ if (isKg(name, mu)) return [price, list]; continue; }
    if (unit === 'kg'){
      if (isKg(name, mu)) return [price, list];
      const s = sizes(name); if (s.g && s.g >= 300 && s.g <= 5000) return [price*1000/s.g, list*1000/s.g];
      continue;
    }
    const s = sizes(name); const have = s[unit];
    if (!have) continue;
    const r = amt / have;
    const lo = unit === 'u' ? 0.2 : 0.55, hi = unit === 'u' ? 3.1 : 1.85;
    if (have/amt < lo || have/amt > hi) continue;
    return [price*r, list*r];
  }
  return null;
}


export { ITEMS, normalize, sizes, isKg };
