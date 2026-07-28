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
    source_notes = []
    for year in (2023, 2024, 2025):
        path = ROOT / f"receitas-vargem-grande-do-sul-{year}.csv"
        monthly, details = parse_csv(path)
        parse_detailed_csv(path, detailed_items, detailed_records)
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
        "sources": source_notes,
        "missingYears": [2022],
        "defaults": {
            "pessimista": {"fpm": -3, "icms": -5, "ipva": -2, "ipi": -3, "sus": 0, "fnde": 0, "default": -2},
            "realista": {"fpm": 4, "icms": 3, "ipva": 5, "ipi": 3, "sus": 2, "fnde": 3, "default": 3},
            "otimista": {"fpm": 8, "icms": 7, "ipva": 8, "ipi": 7, "sus": 5, "fnde": 5, "default": 6},
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
