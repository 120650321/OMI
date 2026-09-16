import os
import tempfile
import pandas as pd
from database import SessionLocal, init_db
from models import Contract, EquipmentCategory, EquipmentItem, Penalty

EXCEL_PATH = r"f:\kaifa\OMI\DOC\智能工地设备用量、费用确认表（升级合同）.xls"


def parse_float(v):
    try:
        return float(v)
    except (ValueError, TypeError):
        return 0.0


def is_category_seq(seq):
    if not seq:
        return False
    seq = seq.strip().replace("\u3000", "").replace(" ", "").replace("（", "(").replace("）", ")")
    prefixes = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十",
                "(一)", "(二)", "(三)", "(四)", "(五)", "(六)", "(七)", "(八)", "(九)", "(十)"]
    return seq in prefixes


def get_tax_rate(category_name):
    """系统集成(含软件开发/维护服务)6%, 设备类13%"""
    integration_keywords = ["系统集成", "网络升级", "网络维护", "软件开发", "局域网专线", "网络及迁改"]
    for kw in integration_keywords:
        if kw in category_name:
            return 0.06
    return 0.13


def import_all(db):
    existing = db.query(Contract).first()
    if existing:
        print("Data already imported, skipping...")
        return

    xl = pd.ExcelFile(EXCEL_PATH)

    # Import from 审批单 sheet for contract info
    df_approval = pd.read_excel(xl, "审批单", header=None)
    contract_no = str(df_approval.iloc[0, 3]).strip() if pd.notna(df_approval.iloc[0, 3]) else "GCGJ23-2021-002A-CG03"
    contract_name = str(df_approval.iloc[1, 1]).strip() if pd.notna(df_approval.iloc[1, 1]) else "CX项目智能工地升级物资采购"

    # Find contract amount from the summary
    contract_amount = 1828351.90
    for i in range(df_approval.shape[0]):
        val = str(df_approval.iloc[i, 0]).strip() if pd.notna(df_approval.iloc[i, 0]) else ""
        if "合同金额" in val:
            amt = df_approval.iloc[i, 1]
            if pd.notna(amt):
                contract_amount = parse_float(amt)
            break

    contract = Contract(
        project_name=contract_name,
        contract_no=contract_no,
        contract_amount=contract_amount,
        prepayment=0,
        party_a="楚雄国储龙慧项目部",
        party_b="中国电信股份有限公司楚雄分公司"
    )
    db.add(contract)
    db.flush()
    print(f"Created contract: {contract_name} ({contract_no}), Amount: {contract_amount}")

    # Import from 进度款申请 sheet
    df = pd.read_excel(xl, "进度款申请", header=None)
    current_category = None
    category_order = 0
    item_count = 0

    for idx in range(6, len(df)):
        row = df.iloc[idx]
        seq = str(row[0]).strip() if pd.notna(row[0]) else ""
        name = str(row[1]).strip() if pd.notna(row[1]) else ""
        if not name or name == "nan":
            continue
        if name in ["合计", "四"]:
            continue

        # Check if category header
        if is_category_seq(seq):
            current_category = EquipmentCategory(
                contract_id=contract.id, seq_no=seq, name=name, sort_order=category_order,
                tax_rate=get_tax_rate(name)
            )
            db.add(current_category)
            db.flush()
            category_order += 1
            continue

        spec = str(row[2]).strip() if pd.notna(row[2]) and str(row[2]).strip() != "nan" else ""
        unit = str(row[3]).strip() if pd.notna(row[3]) and str(row[3]).strip() != "nan" else ""
        qty = parse_float(row[4])
        unit_price = parse_float(row[5])
        contract_amt = parse_float(row[6])

        item = EquipmentItem(
            contract_id=contract.id,
            category_id=current_category.id if current_category else None,
            seq_no=seq if seq != "nan" else "",
            name=name, specification=spec,
            unit=unit, contract_quantity=qty,
            unit_price=unit_price, contract_amount=contract_amt
        )
        db.add(item)
        item_count += 1

    # Import penalties
    df_penalty = pd.read_excel(xl, "罚款单", header=None)
    penalty_count = 0
    for idx in range(6, len(df_penalty)):
        row = df_penalty.iloc[idx]
        doc_no = str(row[1]).strip() if pd.notna(row[1]) else ""
        if not doc_no or doc_no == "nan":
            continue
        if "合计" in doc_no or "文件编号" in doc_no:
            continue

        penalty_date = None
        if pd.notna(row[3]):
            try:
                penalty_date = pd.to_datetime(row[3]).to_pydatetime().date()
            except Exception:
                pass

        project_penalty = parse_float(row[5]) if pd.notna(row[5]) else 0
        personal_penalty = parse_float(row[6]) if len(row) > 6 and pd.notna(row[6]) and str(row[6]).strip() not in ["nan", ""] else 0
        total_penalty = parse_float(row[4]) if pd.notna(row[4]) else 0
        if total_penalty == 0 and len(row) > 7:
            total_penalty = parse_float(row[7])
        unit_val = str(row[8]).strip() if len(row) > 8 and pd.notna(row[8]) else ""
        category_val = str(row[9]).strip() if len(row) > 9 and pd.notna(row[9]) else ""

        penalty = Penalty(
            contract_id=contract.id,
            doc_no=doc_no,
            doc_name=str(row[2]).strip() if pd.notna(row[2]) else "",
            penalty_date=penalty_date,
            project_penalty=project_penalty,
            personal_penalty=personal_penalty,
            total_penalty=total_penalty,
            unit=unit_val,
            category=category_val
        )
        db.add(penalty)
        penalty_count += 1

    db.commit()
    print(f"Imported {item_count} equipment items in {category_order} categories")
    print(f"Imported {penalty_count} penalties")


if __name__ == "__main__":
    init_db()
    db = SessionLocal()
    import_all(db)
    db.close()
    print("Import completed!")


def import_to_contract(file_bytes: bytes, contract_id: int, db):
    """从上传的Excel文件导入设备清单和罚款记录到指定合同"""
    contract = db.query(Contract).filter(Contract.id == contract_id).first()
    if not contract:
        raise ValueError(f"合同ID={contract_id}不存在")

    # 删除该合同现有的设备项和分类
    db.query(EquipmentItem).filter(EquipmentItem.contract_id == contract_id).delete()
    db.query(EquipmentCategory).filter(EquipmentCategory.contract_id == contract_id).delete()
    db.query(Penalty).filter(Penalty.contract_id == contract_id).delete()
    db.flush()

    # 读取上传的Excel文件
    with tempfile.NamedTemporaryFile(suffix='.xls', delete=False) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        xl = pd.ExcelFile(tmp_path)

        # 如果合同名称/编号为空，尝试从审批单 sheet 读取
        df_approval = pd.read_excel(xl, "审批单", header=None)
        if not contract.contract_no:
            contract_no = str(df_approval.iloc[0, 3]).strip() if pd.notna(df_approval.iloc[0, 3]) else ""
            contract.contract_no = contract_no or "GCGJ23-2021-002A-CG03"
        if not contract.project_name:
            contract_name = str(df_approval.iloc[1, 1]).strip() if pd.notna(df_approval.iloc[1, 1]) else ""
            contract.project_name = contract_name or "CX项目智能工地升级物资采购"

        # 进度款申请 sheet 解析设备清单
        df = pd.read_excel(xl, "进度款申请", header=None)
        current_category = None
        category_order = 0
        item_count = 0

        for idx in range(6, len(df)):
            row = df.iloc[idx]
            seq = str(row[0]).strip() if pd.notna(row[0]) else ""
            name = str(row[1]).strip() if pd.notna(row[1]) else ""
            if not name or name == "nan":
                continue
            if name in ["合计", "四"]:
                continue

            if is_category_seq(seq):
                current_category = EquipmentCategory(
                    contract_id=contract_id, seq_no=seq, name=name,
                    sort_order=category_order, tax_rate=get_tax_rate(name)
                )
                db.add(current_category)
                db.flush()
                category_order += 1
                continue

            spec = str(row[2]).strip() if pd.notna(row[2]) and str(row[2]).strip() != "nan" else ""
            unit = str(row[3]).strip() if pd.notna(row[3]) and str(row[3]).strip() != "nan" else ""
            qty = parse_float(row[4])
            unit_price = parse_float(row[5])
            contract_amt = parse_float(row[6])

            item = EquipmentItem(
                contract_id=contract_id,
                category_id=current_category.id if current_category else None,
                seq_no=seq if seq != "nan" else "",
                name=name, specification=spec,
                unit=unit, contract_quantity=qty,
                unit_price=unit_price, contract_amount=contract_amt
            )
            db.add(item)
            item_count += 1

        # 罚款单 sheet
        df_penalty = pd.read_excel(xl, "罚款单", header=None)
        penalty_count = 0
        for idx in range(6, len(df_penalty)):
            row = df_penalty.iloc[idx]
            doc_no = str(row[1]).strip() if pd.notna(row[1]) else ""
            if not doc_no or doc_no == "nan":
                continue
            if "合计" in doc_no or "文件编号" in doc_no:
                continue

            penalty_date = None
            if pd.notna(row[3]):
                try:
                    penalty_date = pd.to_datetime(row[3]).to_pydatetime().date()
                except Exception:
                    pass

            project_penalty = parse_float(row[5]) if pd.notna(row[5]) else 0
            personal_penalty = parse_float(row[6]) if len(row) > 6 and pd.notna(row[6]) and str(row[6]).strip() not in ["nan", ""] else 0
            total_penalty = parse_float(row[4]) if pd.notna(row[4]) else 0
            if total_penalty == 0 and len(row) > 7:
                total_penalty = parse_float(row[7])
            unit_val = str(row[8]).strip() if len(row) > 8 and pd.notna(row[8]) else ""
            category_val = str(row[9]).strip() if len(row) > 9 and pd.notna(row[9]) else ""

            penalty = Penalty(
                contract_id=contract_id,
                doc_no=doc_no,
                doc_name=str(row[2]).strip() if pd.notna(row[2]) else "",
                penalty_date=penalty_date,
                project_penalty=project_penalty,
                personal_penalty=personal_penalty,
                total_penalty=total_penalty,
                unit=unit_val,
                category=category_val
            )
            db.add(penalty)
            penalty_count += 1

        db.commit()
        return {
            "item_count": item_count,
            "category_count": category_order,
            "penalty_count": penalty_count,
            "contract_id": contract_id
        }
    finally:
        os.unlink(tmp_path)