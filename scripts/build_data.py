import csv
import json
import re
import unicodedata
from collections import defaultdict
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "data"

CATEGORIES = [
    {"id": "iptu", "name": "IPTU", "origin": "Município", "risk": "Baixo", "macro": "Cadastro imobiliário, inadimplência e atualização da planta"},
    {"id": "itbi", "name": "ITBI", "origin": "Município", "risk": "Alto", "macro": "Mercado imobiliário, crédito e taxa Selic"},
    {"id": "irrf", "name": "IRRF", "origin": "Município", "risk": "Médio", "macro": "Massa salarial e pagamentos municipais"},
    {"id": "issqn", "name": "ISSQN", "origin": "Município", "risk": "Médio", "macro": "Atividade do setor de serviços e fiscalização tributária"},
    {"id": "taxas", "name": "Taxas", "origin": "Município", "risk": "Baixo", "macro": "Fiscalização, prestação de serviços e atualização tarifária"},
    {"id": "contrib_melhoria", "name": "Contribuição de Melhoria", "origin": "Município", "risk": "Alto", "macro": "Execução de obras e lançamento tributário"},
    {"id": "contribuicoes", "name": "Contribuições", "origin": "Município", "risk": "Baixo", "macro": "Custeio de iluminação e contribuições vinculadas"},
    {"id": "patrimonial", "name": "Receita Patrimonial", "origin": "Município", "risk": "Médio", "macro": "Taxa Selic, aplicações financeiras e exploração patrimonial"},
    {"id": "servicos", "name": "Receita de Serviços", "origin": "Município", "risk": "Médio", "macro": "Demanda pelos serviços públicos e atualização tarifária"},
    {"id": "outras_correntes", "name": "Outras Receitas Correntes", "origin": "Município", "risk": "Alto", "macro": "Multas, restituições, ressarcimentos e receitas diversas"},
    {"id": "fpm", "name": "FPM", "origin": "União", "risk": "Médio", "macro": "PIB nacional e arrecadação de IR/IPI"},
    {"id": "itr", "name": "ITR", "origin": "União", "risk": "Médio", "macro": "Atividade agropecuária e valores de terra"},
    {"id": "comp_fin", "name": "Compensações Financeiras", "origin": "União", "risk": "Alto", "macro": "Produção e preços de recursos naturais"},
    {"id": "sus", "name": "SUS", "origin": "União", "risk": "Baixo", "macro": "Política federal de saúde e IPCA"},
    {"id": "fnde", "name": "FNDE", "origin": "União", "risk": "Baixo", "macro": "Matrículas, programas educacionais e IPCA"},
    {"id": "cide", "name": "CIDE", "origin": "União", "risk": "Alto", "macro": "Combustíveis e atividade econômica"},
    {"id": "lc176", "name": "LC 176", "origin": "União", "risk": "Médio", "macro": "Cronograma legal de compensações"},
    {"id": "royalties", "name": "Royalties", "origin": "União", "risk": "Alto", "macro": "Petróleo, gás e câmbio"},
    {"id": "icms", "name": "ICMS", "origin": "Estado", "risk": "Alto", "macro": "Consumo das famílias e atividade estadual"},
    {"id": "ipva", "name": "IPVA", "origin": "Estado", "risk": "Baixo", "macro": "Frota, venda e valor de veículos"},
    {"id": "ipi", "name": "IPI Exportação", "origin": "Estado", "risk": "Médio", "macro": "Produção industrial e exportações"},
    {"id": "convenios_est", "name": "Convênios estaduais", "origin": "Estado", "risk": "Alto", "macro": "Carteira de convênios e execução de obras"},
    {"id": "outras_est", "name": "Outras transferências", "origin": "Estado", "risk": "Médio", "macro": "Políticas e programas estaduais"},
]


def normalize(value):
    value = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode()
    return value.upper()


def classify(code, desc):
    c = re.sub(r"\D", "", code or "")[:8]
    d = normalize(desc)
    if c.startswith("111250"):
        return "iptu"
    if c.startswith("111253"):
        return "itbi"
    if c.startswith("111303"):
        return "irrf"
    if c.startswith("111451"):
        return "issqn"
    if c.startswith("112"):
        return "taxas"
    if c.startswith("113"):
        return "contrib_melhoria"
    if c.startswith("12"):
        return "contribuicoes"
    if c.startswith("13"):
        return "patrimonial"
    if c.startswith("16"):
        return "servicos"
    if c.startswith("19"):
        return "outras_correntes"
    # Deduções do Fundeb precisam retornar à receita-base para apuração líquida.
    if c.startswith("9517115") and "FPM" in d:
        return "fpm"
    if c.startswith("9517115") and "ITR" in d:
        return "itr"
    if c.startswith("9517215") and "ICMS" in d:
        return "icms"
    if c.startswith("9517215") and "IPVA" in d:
        return "ipva"
    if c.startswith("9517215") and "IPI" in d:
        return "ipi"
    if c.startswith("171151"):
        return "fpm"
    if c.startswith("171152"):
        return "itr"
    if c.startswith("171350"):
        return "sus"
    if c.startswith("1714"):
        return "fnde"
    if c.startswith("172150"):
        return "icms"
    if c.startswith("172151"):
        return "ipva"
    if c.startswith("172152"):
        return "ipi"
    if c.startswith("172153") or "CIDE" in d:
        return "cide"
    if "LC 176" in d or "LEI COMPLEMENTAR 176" in d:
        return "lc176"
    if "ROYALT" in d:
        return "royalties"
    if "COMPENSAC" in d and ("FINANCEIR" in d or "RECURSOS MINERAIS" in d):
        return "comp_fin"
    if c.startswith(("1724", "2422")):
        return "convenios_est"
    if c.startswith(("1729", "2429")):
        return "outras_est"
    return None


def parse_csv(path):
    monthly = defaultdict(lambda: defaultdict(float))
    details = defaultdict(set)
    with path.open("r", encoding="latin-1", newline="") as fh:
        reader = csv.DictReader(fh, delimiter=";")
        for row in reader:
            key = classify(row["ds_tipo"].split(" - ", 1)[0], row["ds_tipo"])
            if not key:
                continue
            month = int(row["mes_referencia"])
            amount = float(row["vl_arrecadacao"].replace(".", "").replace(",", "."))
            monthly[month][key] += amount
            details[key].add(row["ds_tipo"])
    return monthly, details


def clean_label(value):
    return (value or "").split(" - ", 1)[-1].strip()


def detailed_theme(code, text):
    c = re.sub(r"\D", "", code or "")
    t = normalize(text)
    social = ("ASSISTENCIA SOCIAL", "SUAS", "FNAS", "CRAS", "CREAS", "BOLSA FAMILIA",
              "CRIANCA", "ADOLESCENTE", "IDOSO", "PROTECAO SOCIAL", "CADUNICO")
    if any(k in t for k in social):
        return "Assistência social"
    if c.startswith(("1112", "1113", "1114")):
        return "Impostos municipais"
    if "SAUDE" in t or "SUS" in t:
        return "Saúde"
    if any(k in t for k in ("EDUCAC", "FNDE", "FUNDEB", "PNAE", "PNATE", "SALARIO-EDUCAC")):
        return "Educação"
    if c.startswith("17") or c.startswith("24") or c.startswith("95"):
        return "Transferências"
    if c.startswith("12"):
        return "Contribuições"
    if c.startswith("13"):
        return "Receita patrimonial"
    if c.startswith("16"):
        return "Serviços"
    if c.startswith("21"):
        return "Operações de crédito"
    return "Outras receitas"


def detailed_origin(code, text):
    c = re.sub(r"\D", "", code or "")
    t = normalize(text)
    if c.startswith(("171", "241")) or "UNIAO" in t or "FNAS" in t or "FNDE" in t:
        return "União"
    if c.startswith(("172", "242")) or "ESTADO" in t:
        return "Estado"
    if c.startswith(("175", "245")):
        return "Outras instituições"
    if c.startswith(("111", "112", "113", "12", "13", "16", "19", "21")):
        return "Município"
    return "Outras"


def parse_detailed_csv(path, item_map, record_map):
    with path.open("r", encoding="latin-1", newline="") as fh:
        reader = csv.DictReader(fh, delimiter=";")
        for row in reader:
            code = row["ds_tipo"].split(" - ", 1)[0].strip()
            account = clean_label(row["ds_tipo"])
            app_fixed = clean_label(row["ds_cd_aplicacao_fixo"])
            app_var = clean_label(row["ds_cd_aplicacao_variavel"])
            org = row["ds_orgao"].strip()
            context = " ".join((account, app_fixed, app_var, row["ds_fonte_recurso"]))
            theme = detailed_theme(code, context)
            origin = detailed_origin(code, context)
            # Aplicações específicas são mantidas para permitir estudar convênios e programas.
            app_key = row["ds_cd_aplicacao_fixo"].split(" - ", 1)[0].strip()
            var_key = row["ds_cd_aplicacao_variavel"].split(" - ", 1)[0].strip()
            item_id = f"{code}|{app_key}|{var_key}|{org}"
            if item_id not in item_map:
                item_map[item_id] = {
                    "id": item_id, "code": code, "name": account, "theme": theme, "origin": origin,
                    "application": app_fixed, "applicationDetail": app_var, "agency": org,
                    "level1": clean_label(row["ds_categoria"]),
                    "level2": clean_label(row["ds_subcategoria"]),
                    "level3": clean_label(row["ds_fonte"]),
                }
            amount = float(row["vl_arrecadacao"].replace(".", "").replace(",", "."))
            record_map[(int(row["ano_exercicio"]), int(row["mes_referencia"]), item_id)] += amount


RAW_COLUMNS = [
    {"key": "recordId", "label": "ID do lançamento", "type": "text"},
    {"key": "year", "label": "Ano", "type": "number"},
    {"key": "month", "label": "Mês", "type": "number"},
    {"key": "monthName", "label": "Mês por extenso", "type": "text"},
    {"key": "municipality", "label": "Município", "type": "text"},
    {"key": "agency", "label": "Órgão", "type": "text"},
    {"key": "power", "label": "Poder", "type": "text"},
    {"key": "resourceSource", "label": "Fonte de recurso", "type": "text"},
    {"key": "appFixed", "label": "Aplicação fixa", "type": "text"},
    {"key": "appVariable", "label": "Aplicação variável", "type": "text"},
    {"key": "category", "label": "Categoria", "type": "text"},
    {"key": "subcategory", "label": "Subcategoria", "type": "text"},
    {"key": "source", "label": "Fonte", "type": "text"},
    {"key": "level1", "label": "Desdobramento 1", "type": "text"},
    {"key": "level2", "label": "Desdobramento 2", "type": "text"},
    {"key": "level3", "label": "Desdobramento 3", "type": "text"},
    {"key": "account", "label": "Natureza da receita", "type": "text"},
    {"key": "code", "label": "Código contábil", "type": "text"},
    {"key": "value", "label": "Valor arrecadado", "type": "currency"},
    {"key": "budget", "label": "Valor orçado", "type": "currency"},
    {"key": "periodValue", "label": "Valor do período", "type": "currency"},
    {"key": "level", "label": "Nível", "type": "number"},
    {"key": "sourceFile", "label": "Arquivo de origem", "type": "text"},
]


def parse_raw_csv(path):
    rows = []
    with path.open("r", encoding="latin-1", newline="") as fh:
        for row in csv.DictReader(fh, delimiter=";"):
            code = row["ds_tipo"].split(" - ", 1)[0].strip()
            rows.append({
                "recordId": row["id_rec_arrec_detalhe"],
                "year": int(row["ano_exercicio"]), "month": int(row["mes_referencia"]),
                "monthName": row["mes_ref_extenso"], "municipality": row["ds_municipio"],
                "agency": row["ds_orgao"], "power": row["ds_poder"],
                "resourceSource": row["ds_fonte_recurso"], "appFixed": row["ds_cd_aplicacao_fixo"],
                "appVariable": row["ds_cd_aplicacao_variavel"], "category": row["ds_categoria"],
                "subcategory": row["ds_subcategoria"], "source": row["ds_fonte"],
                "level1": row["ds_d1"], "level2": row["ds_dd2"], "level3": row["ds_d3"],
                "account": row["ds_tipo"], "code": code,
                "value": round(float(row["vl_arrecadacao"].replace(".", "").replace(",", ".")), 2),
                "budget": None, "periodValue": None, "level": None, "sourceFile": path.name,
            })
    return rows


def parse_raw_2026(path):
    rows = []
    if not path.exists():
        return rows
    with path.open("r", encoding="latin-1", newline="") as fh:
        for row in csv.DictReader(fh, delimiter=";"):
            prefix = "balanceteReceitaReportVO."
            get = lambda key: row.get(prefix + key, "")
            def number(key):
                raw = (get(key) or "").replace(".", "").replace(",", ".")
                return float(raw) if raw else None
            code = get("codigoCompleto")
            rows.append({
                "recordId": "",
                "year": 2026, "month": 0, "monthName": "Acumulado", "municipality": "Vargem Grande do Sul",
                "agency": "", "power": "", "resourceSource": get("nomeFonte"),
                "appFixed": " - ".join(filter(None, (get("codigoCaFixo"), get("nomeCaFixo")))),
                "appVariable": " - ".join(filter(None, (get("codigoCaVariavel"), get("nomeCaVariavel")))),
                "category": get("tipo"), "subcategory": get("tipoNatureza"), "source": get("nomeFonte"),
                "level1": "", "level2": "", "level3": "", "account": get("nomeReceita"),
                "code": code, "value": number("valorAcumulado"), "budget": number("orcado"),
                "periodValue": number("valorPeriodo"), "level": int(get("nivel")) if get("nivel") else None,
                "sourceFile": path.name,
            })
    return rows


def br_number(raw):
    return float(raw.replace(".", "").replace(",", "."))


def pdf_value(text, code_pattern, label=None):
    pattern = rf"(-?[\d.]+,\d{{2}}){code_pattern}"
    matches = re.findall(pattern, text, flags=re.I)
    if not matches:
        return 0.0
    return br_number(matches[0])


def parse_pdf(path):
    text = "\n".join((p.extract_text() or "") for p in PdfReader(path).pages)
    vals = {
        "iptu": pdf_value(text, r"1\.1\.1\.2\.50\.0\.0\."),
        "itbi": pdf_value(text, r"1\.1\.1\.2\.53\.0\.0\."),
        "irrf": pdf_value(text, r"1\.1\.1\.3\.03\.0\.0\."),
        "issqn": pdf_value(text, r"1\.1\.1\.4\.51\.0\.0\."),
        "taxas": pdf_value(text, r"1\.1\.2\.0\.00\.0\.0\."),
        "contrib_melhoria": pdf_value(text, r"1\.1\.3\.0\.00\.0\.0\."),
        "contribuicoes": pdf_value(text, r"1\.2\.0\.0\.00\.0\.0\."),
        "patrimonial": pdf_value(text, r"1\.3\.0\.0\.00\.0\.0\."),
        "servicos": pdf_value(text, r"1\.6\.0\.0\.00\.0\.0\."),
        "outras_correntes": pdf_value(text, r"1\.9\.0\.0\.00\.0\.0\."),
        "fpm": pdf_value(text, r"1\.7\.1\.1\.51\."),
        "itr": pdf_value(text, r"1\.7\.1\.1\.52\."),
        "sus": pdf_value(text, r"1\.7\.1\.3\.50\."),
        "fnde": pdf_value(text, r"1\.7\.1\.4\.00\."),
        "icms": pdf_value(text, r"1\.7\.2\.1\.50\."),
        "ipva": pdf_value(text, r"1\.7\.2\.1\.51\."),
        "ipi": pdf_value(text, r"1\.7\.2\.1\.52\."),
        "cide": pdf_value(text, r"1\.7\.2\.1\.53\."),
        "convenios_est": pdf_value(text, r"1\.7\.2\.4\.00\.") + pdf_value(text, r"2\.4\.2\.2\.00\."),
        "outras_est": pdf_value(text, r"1\.7\.2\.9\.00\.") + pdf_value(text, r"2\.4\.2\.9\.00\."),
    }
    lc_match = re.search(r"(-?[\d.]+,\d{2})1\.7\.1\.9\.99\.0\.1\.\d+.*?LC 176", text, re.I | re.S)
    vals["lc176"] = br_number(lc_match.group(1)) if lc_match else 0.0
    vals["royalties"] = 0.0
    vals["comp_fin"] = 0.0
    deductions = {
        "fpm": pdf_value(text, r"9\.5\.1\.7\.11\.5\.0\."),
        "itr": pdf_value(text, r"9\.5\.1\.7\.11\.5\.2\."),
        "icms": pdf_value(text, r"9\.5\.1\.7\.21\.5\.0\."),
        "ipva": pdf_value(text, r"9\.5\.1\.7\.21\.5\.1\."),
        "ipi": pdf_value(text, r"9\.5\.1\.7\.21\.5\.2\."),
    }
    for key, value in deductions.items():
        vals[key] += value
    return vals


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    records = []
    detailed_items = {}
    detailed_records = defaultdict(float)
    raw_records = []
    source_notes = []
    for year in (2023, 2024, 2025):
        path = ROOT / f"receitas-vargem-grande-do-sul-{year}.csv"
        monthly, details = parse_csv(path)
        parse_detailed_csv(path, detailed_items, detailed_records)
        raw_records.extend(parse_raw_csv(path))
        for month in range(1, 13):
            for cat in CATEGORIES:
                records.append({"year": year, "month": month, "category": cat["id"], "value": round(monthly[month][cat["id"]], 2), "status": "realizado"})
        source_notes.append({"year": year, "file": path.name, "coverage": "jan-dez", "method": "lançamentos detalhados mensais; valores líquidos das deduções do Fundeb"})

    pdf_vals = parse_pdf(ROOT / "ATE JUN 26.pdf")
    # O PDF é acumulado sem abertura mensal. Alocação uniforme preserva o total e deixa a limitação explícita.
    for month in range(1, 7):
        for cat in CATEGORIES:
            records.append({"year": 2026, "month": month, "category": cat["id"], "value": round(pdf_vals.get(cat["id"], 0) / 6, 2), "status": "realizado"})
    source_notes.append({"year": 2026, "file": "ATE JUN 26.pdf", "coverage": "jan-jun", "method": "totais acumulados do balancete; rateio mensal uniforme apenas para visualização"})
    raw_records.extend(parse_raw_2026(ROOT / "balanceteReceita de 2026.csv"))
    source_notes.append({"year": 2026, "file": "balanceteReceita de 2026.csv", "coverage": "acumulado", "method": "base hierárquica complementar disponível na grade completa; preserva níveis, orçamento e valores do período"})

    payload = {
        "municipality": "Vargem Grande do Sul",
        "generatedAt": "2026-07-28",
        "categories": CATEGORIES,
        "records": records,
        "detailItems": list(detailed_items.values()),
        "detailRecords": [
            {"year": y, "month": m, "item": item, "value": round(value, 2)}
            for (y, m, item), value in detailed_records.items()
        ],
        "rawColumns": RAW_COLUMNS,
        "rawRecords": raw_records,
        "sources": source_notes,
        "missingYears": [2022],
        "defaults": {
            "pessimista": {"iptu": 2, "itbi": -5, "irrf": 0, "issqn": -4, "fpm": -3, "icms": -5, "ipva": -2, "ipi": -3, "sus": 0, "fnde": 0, "default": -2},
            "realista": {"iptu": 5, "itbi": 3, "irrf": 4, "issqn": 4, "fpm": 4, "icms": 3, "ipva": 5, "ipi": 3, "sus": 2, "fnde": 3, "default": 3},
            "otimista": {"iptu": 8, "itbi": 8, "irrf": 7, "issqn": 8, "fpm": 8, "icms": 7, "ipva": 8, "ipi": 7, "sus": 5, "fnde": 5, "default": 6},
        },
        "assumptions": {
            "base2026": "Executado até junho anualizado por sazonalidade média de 2023-2025; fallback: multiplicação por 2.",
            "historical": "2022 aparece como indisponível porque não foi fornecido arquivo-fonte.",
            "values": "Valores de transferências líquidos das deduções do Fundeb quando identificadas."
        }
    }
    (OUT / "revenues.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {OUT / 'revenues.json'} ({len(records)} records)")
    print("2026:", json.dumps(pdf_vals, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
