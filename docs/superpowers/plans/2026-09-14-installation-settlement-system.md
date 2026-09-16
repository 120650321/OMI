# 智能工地结算安装记录录入核对系统 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 开发一套用于结算安装记录录入核对的Web运用系统，无需认证鉴权。基于《智能工地设备用量、费用确认表（升级合同）》Excel和《安装记录表》Word模板的数据结构。

**Architecture:** 前后端分离架构。后端使用Python FastAPI + SQLAlchemy + SQLite，提供RESTful API。前端使用React + TypeScript + Vite，采用Ant Design组件库快速构建UI。系统无需鉴权。

**Tech Stack:** Python 3.14, FastAPI, SQLAlchemy, SQLite, React 18, TypeScript, Vite, Ant Design 5

**数据来源分析:**
- Excel《费用确认表》4个Sheet：审批单(合同付款审批摘要)、进度款申请(设备清单+单价+合同金额+完成量+结算金额)、工程量确认(设备清单+承包商上报量+项目部核定工程量)、罚款单
- Word《安装记录表》：表格式安装记录模板，含编号、项目名称、设备类型、安装单位、安装人员、安装时间、使用单位、安装内容、安装结论、签字区

---

## 文件结构

```
f:\kaifa\OMI\
├── backend/
│   ├── main.py              # FastAPI 应用入口
│   ├── database.py            # 数据库连接与会话管理
│   ├── models.py              # SQLAlchemy 数据模型
│   ├── schemas.py             # Pydantic 请求/响应模型
│   ├── import_data.py         # Excel数据导入脚本
│   └── requirements.txt       # Python依赖
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── main.tsx           # React入口
│       ├── App.tsx            # 路由配置
│       ├── api/               # API请求封装
│       │   └── index.ts
│       ├── pages/
│       │   ├── Dashboard.tsx           # 仪表盘/首页
│       │   ├── ContractManage.tsx      # 合同管理
│       │   ├── EquipmentList.tsx       # 设备清单
│       │   ├── InstallationRecords.tsx # 安装记录列表
│       │   ├── InstallationForm.tsx    # 安装记录录入/编辑
│       │   ├── ProgressEntry.tsx       # 进度录入（按期次）
│       │   ├── Verification.tsx        # 工程量核对
│       │   └── Settlement.tsx          # 结算管理
│       └── components/
│           └── Layout.tsx     # 页面布局
└── docs/
    └── superpowers/
        └── plans/
            └── 2026-09-14-installation-settlement-system.md
```

---

## 数据模型设计

核心实体及关系：

1. **Contract** - 合同信息（项目名称、合同编号、金额、起止日期、甲乙双方）
2. **EquipmentCategory** - 设备大类（如：系统集成、视频监控、EPC办公楼室内无线覆盖等）
3. **EquipmentItem** - 设备明细（序号、名称、规格型号、单位、清单工程量、综合单价、合同价、所属大类）
4. **ProgressPeriod** - 进度期次（期次编号、起止日期）
5. **ProgressEntry** - 进度条目（关联设备+期次，含承包商上报量/项目部核定量的至上期累计、本期完成、至本期累计）
6. **InstallationRecord** - 安装记录（编号、项目名称、设备类型、安装单位、安装人员、安装时间、使用单位、安装内容、安装结论）
7. **Penalty** - 罚款记录（文件编号、文件名称、时间、金额、类别）

---

### Task 1: 项目初始化与后端基础结构

**Files:**
- Create: `f:\kaifa\OMI\backend\requirements.txt`
- Create: `f:\kaifa\OMI\backend\database.py`
- Create: `f:\kaifa\OMI\backend\models.py`
- Create: `f:\kaifa\OMI\backend\schemas.py`
- Create: `f:\kaifa\OMI\backend\main.py`

- [ ] **Step 1: 创建 requirements.txt**

```
fastapi==0.115.0
uvicorn==0.30.0
sqlalchemy==2.0.35
pydantic==2.9.0
```

- [ ] **Step 2: 安装后端依赖**

Run: `pip install -r f:\kaifa\OMI\backend\requirements.txt`

- [ ] **Step 3: 创建 database.py**

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATABASE_URL = f"sqlite:///{os.path.join(BASE_DIR, 'settlement.db')}"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    Base.metadata.create_all(bind=engine)
```

- [ ] **Step 4: 创建 models.py - 定义所有数据模型**

```python
from sqlalchemy import Column, Integer, String, Float, Date, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base

class Contract(Base):
    __tablename__ = "contracts"
    id = Column(Integer, primary_key=True, autoincrement=True)
    project_name = Column(String(200), default="CX项目智能工地升级物资采购")
    contract_no = Column(String(100), default="GCGJ23-2021-002A-CG03")
    contract_amount = Column(Float, default=1828351.90)
    prepayment = Column(Float, default=0)
    start_date = Column(Date)
    end_date = Column(Date)
    party_a = Column(String(200), default="楚雄国储龙慧项目部")
    party_b = Column(String(200), default="中国电信股份有限公司楚雄分公司")
    created_at = Column(DateTime, default=datetime.now)

class EquipmentCategory(Base):
    __tablename__ = "equipment_categories"
    id = Column(Integer, primary_key=True, autoincrement=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    seq_no = Column(String(20))
    name = Column(String(200), nullable=False)
    sort_order = Column(Integer, default=0)

class EquipmentItem(Base):
    __tablename__ = "equipment_items"
    id = Column(Integer, primary_key=True, autoincrement=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    category_id = Column(Integer, ForeignKey("equipment_categories.id"))
    seq_no = Column(String(20))
    name = Column(String(200), nullable=False)
    specification = Column(String(200))
    unit = Column(String(20))
    contract_quantity = Column(Float, default=0)
    unit_price = Column(Float, default=0)
    contract_amount = Column(Float, default=0)
    remark = Column(Text)
    category = relationship("EquipmentCategory", backref="items")

class ProgressPeriod(Base):
    __tablename__ = "progress_periods"
    id = Column(Integer, primary_key=True, autoincrement=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    period_no = Column(Integer, nullable=False)
    start_date = Column(Date)
    end_date = Column(Date)
    is_current = Column(Integer, default=0)
    status = Column(String(20), default="draft")

class ProgressEntry(Base):
    __tablename__ = "progress_entries"
    id = Column(Integer, primary_key=True, autoincrement=True)
    period_id = Column(Integer, ForeignKey("progress_periods.id"), nullable=False)
    item_id = Column(Integer, ForeignKey("equipment_items.id"), nullable=False)
    contractor_prev_cumulative = Column(Float, default=0)
    contractor_current = Column(Float, default=0)
    contractor_total_cumulative = Column(Float, default=0)
    dept_prev_cumulative = Column(Float, default=0)
    dept_current = Column(Float, default=0)
    dept_total_cumulative = Column(Float, default=0)
    settlement_amount = Column(Float, default=0)
    payment_amount = Column(Float, default=0)
    period = relationship("ProgressPeriod", backref="entries")
    item = relationship("EquipmentItem", backref="progress_entries")

class InstallationRecord(Base):
    __tablename__ = "installation_records"
    id = Column(Integer, primary_key=True, autoincrement=True)
    record_no = Column(String(50))
    project_name = Column(String(200), default="CX项目智能工地建设")
    equipment_type = Column(String(100))
    install_unit = Column(String(200), default="中国电信股份有限公司楚雄分公司")
    install_personnel = Column(String(200))
    install_date = Column(Date)
    use_unit = Column(String(200))
    install_content = Column(Text)
    install_conclusion = Column(Text)
    install_signatory = Column(String(100))
    install_sign_date = Column(Date)
    client_signatory = Column(String(100))
    client_sign_date = Column(Date)
    created_at = Column(DateTime, default=datetime.now)
    items = relationship("InstallationRecordItem", backref="record", cascade="all, delete-orphan")

class InstallationRecordItem(Base):
    __tablename__ = "installation_record_items"
    id = Column(Integer, primary_key=True, autoincrement=True)
    record_id = Column(Integer, ForeignKey("installation_records.id"), nullable=False)
    equipment_item_id = Column(Integer, ForeignKey("equipment_items.id"))
    equipment_name = Column(String(200))
    specification = Column(String(200))
    unit = Column(String(20))
    quantity = Column(Float, default=0)
    location = Column(String(200))
    remark = Column(Text)

class Penalty(Base):
    __tablename__ = "penalties"
    id = Column(Integer, primary_key=True, autoincrement=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    doc_no = Column(String(100))
    doc_name = Column(String(200))
    penalty_date = Column(Date)
    project_penalty = Column(Float, default=0)
    personal_penalty = Column(Float, default=0)
    total_penalty = Column(Float, default=0)
    unit = Column(String(200))
    category = Column(String(50))
```

- [ ] **Step 5: 创建 schemas.py - Pydantic模型**

```python
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import date, datetime

class EquipmentItemOut(BaseModel):
    id: int
    contract_id: int
    category_id: Optional[int] = None
    seq_no: Optional[str] = None
    name: str
    specification: Optional[str] = None
    unit: Optional[str] = None
    contract_quantity: float = 0
    unit_price: float = 0
    contract_amount: float = 0
    remark: Optional[str] = None
    category_name: Optional[str] = None
    model_config = {"from_attributes": True}

class ProgressEntryIn(BaseModel):
    item_id: int
    contractor_prev_cumulative: float = 0
    contractor_current: float = 0
    contractor_total_cumulative: float = 0
    dept_prev_cumulative: float = 0
    dept_current: float = 0
    dept_total_cumulative: float = 0
    settlement_amount: float = 0
    payment_amount: float = 0

class ProgressPeriodCreate(BaseModel):
    period_no: int
    start_date: date
    end_date: date
    entries: List[ProgressEntryIn]

class ProgressPeriodOut(BaseModel):
    id: int
    contract_id: int
    period_no: int
    start_date: date
    end_date: date
    status: str
    model_config = {"from_attributes": True}

class ProgressEntryOut(BaseModel):
    id: int
    period_id: int
    item_id: int
    contractor_prev_cumulative: float = 0
    contractor_current: float = 0
    contractor_total_cumulative: float = 0
    dept_prev_cumulative: float = 0
    dept_current: float = 0
    dept_total_cumulative: float = 0
    settlement_amount: float = 0
    payment_amount: float = 0
    item_name: Optional[str] = None
    item_spec: Optional[str] = None
    item_unit: Optional[str] = None
    item_contract_qty: float = 0
    item_unit_price: float = 0
    model_config = {"from_attributes": True}

class InstallationRecordItemIn(BaseModel):
    equipment_item_id: Optional[int] = None
    equipment_name: str
    specification: Optional[str] = None
    unit: Optional[str] = None
    quantity: float = 0
    location: Optional[str] = None
    remark: Optional[str] = None

class InstallationRecordCreate(BaseModel):
    record_no: Optional[str] = None
    project_name: str = "CX项目智能工地建设"
    equipment_type: str
    install_unit: str = "中国电信股份有限公司楚雄分公司"
    install_personnel: str
    install_date: date
    use_unit: Optional[str] = None
    install_content: str
    install_conclusion: Optional[str] = None
    install_signatory: Optional[str] = None
    install_sign_date: Optional[date] = None
    client_signatory: Optional[str] = None
    client_sign_date: Optional[date] = None
    items: List[InstallationRecordItemIn] = []

class InstallationRecordOut(BaseModel):
    id: int
    record_no: Optional[str] = None
    project_name: str
    equipment_type: str
    install_unit: str
    install_personnel: str
    install_date: date
    use_unit: Optional[str] = None
    install_content: Optional[str] = None
    install_conclusion: Optional[str] = None
    install_signatory: Optional[str] = None
    install_sign_date: Optional[date] = None
    client_signatory: Optional[str] = None
    client_sign_date: Optional[date] = None
    created_at: datetime
    items: List[InstallationRecordItemIn] = []
    model_config = {"from_attributes": True}

class SettlementSummary(BaseModel):
    contract_amount: float = 0
    total_settlement: float = 0
    total_paid: float = 0
    total_penalty: float = 0
    unpaid: float = 0
    completion_rate: float = 0
```

- [ ] **Step 6: 创建 main.py - FastAPI应用入口（含所有API路由）**

```python
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
import database, models, schemas

app = FastAPI(title="智能工地结算安装记录核对系统")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    database.init_db()

# -------------------- Contract --------------------
@app.get("/api/contracts")
def list_contracts(db: Session = Depends(database.get_db)):
    return db.query(models.Contract).all()

@app.post("/api/contracts")
def create_contract(data: dict, db: Session = Depends(database.get_db)):
    c = models.Contract(**data)
    db.add(c)
    db.commit()
    db.refresh(c)
    return c

# -------------------- Equipment Items --------------------
@app.get("/api/equipment-items")
def list_equipment_items(
    contract_id: int = Query(1),
    category_id: Optional[int] = None,
    db: Session = Depends(database.get_db)
):
    q = db.query(models.EquipmentItem).filter(models.EquipmentItem.contract_id == contract_id)
    if category_id:
        q = q.filter(models.EquipmentItem.category_id == category_id)
    items = q.order_by(models.EquipmentItem.id).all()
    result = []
    for item in items:
        d = schemas.EquipmentItemOut.model_validate(item)
        d.category_name = item.category.name if item.category else None
        result.append(d)
    return result

@app.get("/api/equipment-categories")
def list_categories(contract_id: int = Query(1), db: Session = Depends(database.get_db)):
    return db.query(models.EquipmentCategory).filter(
        models.EquipmentCategory.contract_id == contract_id
    ).order_by(models.EquipmentCategory.sort_order).all()

# -------------------- Progress Periods --------------------
@app.get("/api/progress-periods")
def list_periods(contract_id: int = Query(1), db: Session = Depends(database.get_db)):
    return db.query(models.ProgressPeriod).filter(
        models.ProgressPeriod.contract_id == contract_id
    ).order_by(models.ProgressPeriod.period_no).all()

@app.post("/api/progress-periods")
def create_period(data: schemas.ProgressPeriodCreate, contract_id: int = Query(1), db: Session = Depends(database.get_db)):
    period = models.ProgressPeriod(
        contract_id=contract_id,
        period_no=data.period_no,
        start_date=data.start_date,
        end_date=data.end_date
    )
    db.add(period)
    db.flush()
    for entry_data in data.entries:
        entry = models.ProgressEntry(period_id=period.id, **entry_data.model_dump())
        db.add(entry)
    db.commit()
    db.refresh(period)
    return period

@app.get("/api/progress-entries/{period_id}")
def get_entries(period_id: int, db: Session = Depends(database.get_db)):
    entries = db.query(models.ProgressEntry).filter(
        models.ProgressEntry.period_id == period_id
    ).all()
    result = []
    for e in entries:
        d = schemas.ProgressEntryOut(
            id=e.id, period_id=e.period_id, item_id=e.item_id,
            contractor_prev_cumulative=e.contractor_prev_cumulative,
            contractor_current=e.contractor_current,
            contractor_total_cumulative=e.contractor_total_cumulative,
            dept_prev_cumulative=e.dept_prev_cumulative,
            dept_current=e.dept_current,
            dept_total_cumulative=e.dept_total_cumulative,
            settlement_amount=e.settlement_amount,
            payment_amount=e.payment_amount
        )
        if e.item:
            d.item_name = e.item.name
            d.item_spec = e.item.specification
            d.item_unit = e.item.unit
            d.item_contract_qty = e.item.contract_quantity
            d.item_unit_price = e.item.unit_price
        result.append(d)
    return result

@app.put("/api/progress-entries/batch")
def batch_update_entries(entries: List[schemas.ProgressEntryIn], period_id: int, db: Session = Depends(database.get_db)):
    for data in entries:
        existing = db.query(models.ProgressEntry).filter(
            models.ProgressEntry.period_id == period_id,
            models.ProgressEntry.item_id == data.item_id
        ).first()
        if existing:
            for k, v in data.model_dump().items():
                if k != "item_id":
                    setattr(existing, k, v)
        else:
            entry = models.ProgressEntry(period_id=period_id, **data.model_dump())
            db.add(entry)
    db.commit()
    return {"status": "ok"}

# -------------------- Installation Records --------------------
@app.get("/api/installation-records")
def list_records(db: Session = Depends(database.get_db)):
    records = db.query(models.InstallationRecord).order_by(
        models.InstallationRecord.install_date.desc()
    ).all()
    result = []
    for r in records:
        d = schemas.InstallationRecordOut(
            id=r.id, record_no=r.record_no, project_name=r.project_name,
            equipment_type=r.equipment_type, install_unit=r.install_unit,
            install_personnel=r.install_personnel, install_date=r.install_date,
            use_unit=r.use_unit, install_content=r.install_content,
            install_conclusion=r.install_conclusion,
            install_signatory=r.install_signatory,
            install_sign_date=r.install_sign_date,
            client_signatory=r.client_signatory,
            client_sign_date=r.client_sign_date,
            created_at=r.created_at,
            items=[]
        )
        for ri in r.items:
            d.items.append(schemas.InstallationRecordItemIn(
                equipment_item_id=ri.equipment_item_id,
                equipment_name=ri.equipment_name,
                specification=ri.specification,
                unit=ri.unit, quantity=ri.quantity,
                location=ri.location, remark=ri.remark
            ))
        result.append(d)
    return result

@app.post("/api/installation-records")
def create_record(data: schemas.InstallationRecordCreate, db: Session = Depends(database.get_db)):
    record = models.InstallationRecord(
        record_no=data.record_no or f"CX-{models.InstallationRecord.query.count() + 1:04d}",
        project_name=data.project_name, equipment_type=data.equipment_type,
        install_unit=data.install_unit, install_personnel=data.install_personnel,
        install_date=data.install_date, use_unit=data.use_unit,
        install_content=data.install_content, install_conclusion=data.install_conclusion,
        install_signatory=data.install_signatory,
        install_sign_date=data.install_sign_date,
        client_signatory=data.client_signatory,
        client_sign_date=data.client_sign_date
    )
    db.add(record)
    db.flush()
    for item_data in data.items:
        db.add(models.InstallationRecordItem(record_id=record.id, **item_data.model_dump()))
    db.commit()
    db.refresh(record)
    return {"id": record.id, "status": "ok"}

@app.put("/api/installation-records/{record_id}")
def update_record(record_id: int, data: schemas.InstallationRecordCreate, db: Session = Depends(database.get_db)):
    record = db.query(models.InstallationRecord).filter(models.InstallationRecord.id == record_id).first()
    if not record:
        raise HTTPException(404, "记录不存在")
    for field in ["project_name","equipment_type","install_unit","install_personnel",
                  "install_date","use_unit","install_content","install_conclusion",
                  "install_signatory","install_sign_date","client_signatory","client_sign_date"]:
        setattr(record, field, getattr(data, field))
    db.query(models.InstallationRecordItem).filter(
        models.InstallationRecordItem.record_id == record_id
    ).delete()
    for item_data in data.items:
        db.add(models.InstallationRecordItem(record_id=record_id, **item_data.model_dump()))
    db.commit()
    return {"status": "ok"}

@app.delete("/api/installation-records/{record_id}")
def delete_record(record_id: int, db: Session = Depends(database.get_db)):
    db.query(models.InstallationRecord).filter(models.InstallationRecord.id == record_id).delete()
    db.commit()
    return {"status": "ok"}

# -------------------- Settlement --------------------
@app.get("/api/settlement/summary")
def settlement_summary(contract_id: int = Query(1), db: Session = Depends(database.get_db)):
    contract = db.query(models.Contract).filter(models.Contract.id == contract_id).first()
    items = db.query(models.EquipmentItem).filter(models.EquipmentItem.contract_id == contract_id).all()
    total_settlement = 0
    total_paid = 0
    for item in items:
        for entry in item.progress_entries:
            total_settlement += entry.settlement_amount or 0
            total_paid += entry.payment_amount or 0
    penalties = db.query(models.Penalty).filter(models.Penalty.contract_id == contract_id).all()
    total_penalty = sum(p.total_penalty or 0 for p in penalties)
    return {
        "contract_amount": contract.contract_amount if contract else 0,
        "total_settlement": round(total_settlement, 2),
        "total_paid": round(total_paid, 2),
        "total_penalty": round(total_penalty, 2),
        "unpaid": round(total_settlement - total_paid - total_penalty, 2),
        "completion_rate": round(total_settlement / contract.contract_amount * 100, 2) if contract and contract.contract_amount else 0
    }

# -------------------- Penalty --------------------
@app.get("/api/penalties")
def list_penalties(contract_id: int = Query(1), db: Session = Depends(database.get_db)):
    return db.query(models.Penalty).filter(models.Penalty.contract_id == contract_id).all()

@app.post("/api/penalties")
def create_penalty(data: dict, contract_id: int = Query(1), db: Session = Depends(database.get_db)):
    p = models.Penalty(contract_id=contract_id, **data)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p

# -------------------- Import --------------------
@app.post("/api/import/from-excel")
def import_from_excel(db: Session = Depends(database.get_db)):
    import import_data
    import_data.import_all(db)
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

- [ ] **Step 7: 测试后端启动**

Run: `cd f:\kaifa\OMI\backend && python main.py`
Expected: Server starts on port 8000

---

### Task 2: Excel数据导入脚本

**Files:**
- Create: `f:\kaifa\OMI\backend\import_data.py`

- [ ] **Step 1: 创建 import_data.py**

```python
import pandas as pd
from database import SessionLocal
from models import Contract, EquipmentCategory, EquipmentItem, ProgressPeriod, ProgressEntry, Penalty

EXCEL_PATH = r"f:\kaifa\OMI\DOC\智能工地设备用量、费用确认表（升级合同）.xls"

def parse_float(v):
    try:
        return float(v)
    except (ValueError, TypeError):
        return 0.0

def import_all(db=None):
    if db is None:
        db = SessionLocal()

    existing = db.query(Contract).first()
    if existing:
        return

    contract = Contract(
        project_name="CX项目智能工地升级物资采购",
        contract_no="GCGJ23-2021-002A-CG03",
        contract_amount=1828351.90,
        prepayment=0,
        start_date=None,
        end_date=None
    )
    db.add(contract)
    db.flush()

    xl = pd.ExcelFile(EXCEL_PATH)

    # Import from 进度款申请 sheet
    df = pd.read_excel(xl, "进度款申请", header=None)
    current_category = None
    category_order = 0

    for idx in range(6, len(df)):
        row = df.iloc[idx]
        seq = str(row[0]).strip() if pd.notna(row[0]) else ""
        name = str(row[1]).strip() if pd.notna(row[1]) else ""
        if not name or name == "nan":
            continue

        # Check if this is a category header (Chinese numeral prefix)
        if seq and (seq.startswith("一") or seq.startswith("二") or seq.startswith("三") or seq.startswith("四") or seq.startswith("五") or seq.startswith("六")):
            category = EquipmentCategory(
                contract_id=contract.id, seq_no=seq, name=name, sort_order=category_order
            )
            db.add(category)
            db.flush()
            current_category = category
            category_order += 1
            continue

        if seq == "四" or name in ["合计"]:
            continue

        spec = str(row[2]).strip() if pd.notna(row[2]) and str(row[2]).strip() != "nan" else ""
        unit = str(row[3]).strip() if pd.notna(row[3]) and str(row[3]).strip() != "nan" else ""
        qty = parse_float(row[4])
        unit_price = parse_float(row[5])
        contract_amount = parse_float(row[6])

        item = EquipmentItem(
            contract_id=contract.id,
            category_id=current_category.id if current_category else None,
            seq_no=seq, name=name, specification=spec,
            unit=unit, contract_quantity=qty,
            unit_price=unit_price, contract_amount=contract_amount
        )
        db.add(item)

    # Import from 罚款单 sheet
    df_penalty = pd.read_excel(xl, "罚款单", header=None)
    for idx in range(6, len(df_penalty)):
        row = df_penalty.iloc[idx]
        doc_no = str(row[1]).strip() if pd.notna(row[1]) and str(row[1]).strip() != "nan" else ""
        if not doc_no:
            continue
        penalty = Penalty(
            contract_id=contract.id,
            doc_no=doc_no,
            doc_name=str(row[2]).strip() if pd.notna(row[2]) else "",
            penalty_date=pd.to_datetime(row[3]) if pd.notna(row[3]) else None,
            project_penalty=parse_float(row[5]),
            personal_penalty=parse_float(row[6]) if pd.notna(row[6]) else 0,
            total_penalty=parse_float(row[4]) if pd.notna(row[4]) else parse_float(row[7]),
            unit=str(row[8]).strip() if pd.notna(row[8]) else "",
            category=str(row[9]).strip() if pd.notna(row[9]) else ""
        )
        db.add(penalty)

    db.commit()

if __name__ == "__main__":
    db = SessionLocal()
    import_all(db)
    db.close()
    print("Import completed!")
```

- [ ] **Step 2: 执行数据导入**

Run: `cd f:\kaifa\OMI\backend && python import_data.py`
Expected: "Import completed!"

---

### Task 3: 前端项目初始化与路由配置

**Files:**
- Create: `f:\kaifa\OMI\frontend\package.json`
- Create: `f:\kaifa\OMI\frontend\vite.config.ts`
- Create: `f:\kaifa\OMI\frontend\tsconfig.json`
- Create: `f:\kaifa\OMI\frontend\tsconfig.node.json`
- Create: `f:\kaifa\OMI\frontend\index.html`
- Create: `f:\kaifa\OMI\frontend\src\main.tsx`
- Create: `f:\kaifa\OMI\frontend\src\App.tsx`
- Create: `f:\kaifa\OMI\frontend\src\api\index.ts`
- Create: `f:\kaifa\OMI\frontend\src\components\Layout.tsx`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "settlement-system",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0",
    "antd": "^5.21.0",
    "@ant-design/icons": "^5.4.0",
    "dayjs": "^1.11.13",
    "axios": "^1.7.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: 创建 vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  }
})
```

- [ ] **Step 3: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 4: 创建 tsconfig.node.json**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 5: 创建 index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>智能工地结算安装记录核对系统</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 6: 创建 src/main.tsx**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import 'antd/dist/reset.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

- [ ] **Step 7: 创建 src/api/index.ts**

```typescript
import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

export const contractApi = {
  list: () => api.get('/contracts').then(r => r.data),
}

export const equipmentApi = {
  list: (contractId = 1, categoryId?: number) =>
    api.get('/equipment-items', { params: { contract_id: contractId, category_id: categoryId } }).then(r => r.data),
  categories: (contractId = 1) =>
    api.get('/equipment-categories', { params: { contract_id: contractId } }).then(r => r.data),
}

export const progressApi = {
  periods: (contractId = 1) =>
    api.get('/progress-periods', { params: { contract_id: contractId } }).then(r => r.data),
  createPeriod: (data: any, contractId = 1) =>
    api.post('/progress-periods', data, { params: { contract_id: contractId } }).then(r => r.data),
  getEntries: (periodId: number) =>
    api.get(`/progress-entries/${periodId}`).then(r => r.data),
  batchUpdate: (entries: any[], periodId: number) =>
    api.put('/progress-entries/batch', entries, { params: { period_id: periodId } }).then(r => r.data),
}

export const installationApi = {
  list: () => api.get('/installation-records').then(r => r.data),
  create: (data: any) => api.post('/installation-records', data).then(r => r.data),
  update: (id: number, data: any) => api.put(`/installation-records/${id}`, data).then(r => r.data),
  delete: (id: number) => api.delete(`/installation-records/${id}`).then(r => r.data),
}

export const settlementApi = {
  summary: (contractId = 1) =>
    api.get('/settlement/summary', { params: { contract_id: contractId } }).then(r => r.data),
}

export const penaltyApi = {
  list: (contractId = 1) =>
    api.get('/penalties', { params: { contract_id: contractId } }).then(r => r.data),
  create: (data: any, contractId = 1) =>
    api.post('/penalties', data, { params: { contract_id: contractId } }).then(r => r.data),
}

export const importApi = {
  fromExcel: () => api.post('/import/from-excel').then(r => r.data),
}
```

- [ ] **Step 8: 创建 src/components/Layout.tsx**

```tsx
import React from 'react'
import { Layout, Menu } from 'antd'
import {
  DashboardOutlined, FileTextOutlined, UnorderedListOutlined,
  FormOutlined, EditOutlined, CheckCircleOutlined,
  DollarOutlined, WarningOutlined
} from '@ant-design/icons'
import { useNavigate, useLocation } from 'react-router-dom'

const { Sider, Content, Header } = Layout

const menuItems = [
  { key: '/', icon: <DashboardOutlined />, label: '仪表盘' },
  { key: '/contract', icon: <FileTextOutlined />, label: '合同管理' },
  { key: '/equipment', icon: <UnorderedListOutlined />, label: '设备清单' },
  { key: '/installation', icon: <FormOutlined />, label: '安装记录' },
  { key: '/progress', icon: <EditOutlined />, label: '进度录入' },
  { key: '/verification', icon: <CheckCircleOutlined />, label: '工程量核对' },
  { key: '/settlement', icon: <DollarOutlined />, label: '结算管理' },
  { key: '/penalty', icon: <WarningOutlined />, label: '罚款管理' },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider width={220} theme="dark">
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <h2 style={{ color: '#fff', margin: 0, fontSize: 16 }}>壹众工程智能结算系统</h2>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ background: '#fff', padding: '0 24px', borderBottom: '1px solid #f0f0f0' }}>
          <h3 style={{ margin: 0 }}>
            {menuItems.find(m => m.key === location.pathname)?.label || '智能工地结算安装记录核对系统'}
          </h3>
        </Header>
        <Content style={{ margin: 24, padding: 24, background: '#fff', borderRadius: 8, overflow: 'auto' }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  )
}
```

- [ ] **Step 9: 创建 src/App.tsx**

```tsx
import React from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import AppLayout from './components/Layout'
import Dashboard from './pages/Dashboard'
import ContractManage from './pages/ContractManage'
import EquipmentList from './pages/EquipmentList'
import InstallationRecords from './pages/InstallationRecords'
import InstallationForm from './pages/InstallationForm'
import ProgressEntry from './pages/ProgressEntry'
import Verification from './pages/Verification'
import Settlement from './pages/Settlement'
import PenaltyManage from './pages/PenaltyManage'

export default function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <BrowserRouter>
        <AppLayout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/contract" element={<ContractManage />} />
            <Route path="/equipment" element={<EquipmentList />} />
            <Route path="/installation" element={<InstallationRecords />} />
            <Route path="/installation/new" element={<InstallationForm />} />
            <Route path="/installation/:id/edit" element={<InstallationForm />} />
            <Route path="/progress" element={<ProgressEntry />} />
            <Route path="/verification" element={<Verification />} />
            <Route path="/settlement" element={<Settlement />} />
            <Route path="/penalty" element={<PenaltyManage />} />
          </Routes>
        </AppLayout>
      </BrowserRouter>
    </ConfigProvider>
  )
}
```

- [ ] **Step 10: 安装前端依赖并测试启动**

Run: `cd f:\kaifa\OMI\frontend && npm install && npm run dev`
Expected: Dev server starts on port 3000

---

### Task 4: 仪表盘页面

**Files:**
- Create: `f:\kaifa\OMI\frontend\src\pages\Dashboard.tsx`

- [ ] **Step 1: 创建 Dashboard.tsx**

```tsx
import React, { useEffect, useState } from 'react'
import { Card, Row, Col, Statistic, Table, Tag, Button, message } from 'antd'
import { useNavigate } from 'react-router-dom'
import { settlementApi, installationApi, importApi } from '../api'

export default function Dashboard() {
  const [summary, setSummary] = useState<any>({})
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    settlementApi.summary().then(setSummary).catch(() => {})
    installationApi.list().then(setRecords).catch(() => {})
  }, [])

  const handleImport = async () => {
    setLoading(true)
    try {
      await importApi.fromExcel()
      message.success('数据导入成功')
      window.location.reload()
    } catch {
      message.error('导入失败')
    } finally {
      setLoading(false)
    }
  }

  const recentColumns = [
    { title: '编号', dataIndex: 'record_no', key: 'record_no' },
    { title: '设备类型', dataIndex: 'equipment_type', key: 'equipment_type' },
    { title: '安装人员', dataIndex: 'install_personnel', key: 'install_personnel' },
    { title: '安装日期', dataIndex: 'install_date', key: 'install_date', render: (v: string) => v?.split('T')[0] },
  ]

  return (
    <div>
      <Row gutter={[16, 16]}>
        <Col span={6}>
          <Card><Statistic title="合同金额" value={summary.contract_amount} prefix="¥" precision={2} /></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="累计结算" value={summary.total_settlement} prefix="¥" precision={2} /></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="完成比例" value={summary.completion_rate} suffix="%" precision={2} /></Card>
        </Col>
        <Col span={6}>
          <Card><Statistic title="待支付" value={summary.unpaid} prefix="¥" precision={2} /></Card>
        </Col>
      </Row>
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col span={12}>
          <Card title="快速操作">
            <Button type="primary" onClick={handleImport} loading={loading} style={{ marginRight: 8 }}>
              从Excel导入合同数据
            </Button>
            <Button onClick={() => navigate('/installation/new')}>新建安装记录</Button>
          </Card>
        </Col>
        <Col span={12}>
          <Card title="最近安装记录">
            <Table dataSource={records?.slice(0, 5)} columns={recentColumns} rowKey="id" size="small" pagination={false} />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
```

---

### Task 5: 合同管理与设备清单页面

**Files:**
- Create: `f:\kaifa\OMI\frontend\src\pages\ContractManage.tsx`
- Create: `f:\kaifa\OMI\frontend\src\pages\EquipmentList.tsx`

- [ ] **Step 1: 创建 ContractManage.tsx**

```tsx
import React, { useEffect, useState } from 'react'
import { Card, Descriptions, Table, Tag } from 'antd'
import { contractApi, penaltyApi } from '../api'

export default function ContractManage() {
  const [contracts, setContracts] = useState<any[]>([])
  const [penalties, setPenalties] = useState<any[]>([])

  useEffect(() => {
    contractApi.list().then(setContracts)
    penaltyApi.list().then(setPenalties)
  }, [])

  const contract = contracts[0]

  const penaltyColumns = [
    { title: '文件编号', dataIndex: 'doc_no' },
    { title: '文件名称', dataIndex: 'doc_name' },
    { title: '时间', dataIndex: 'penalty_date', render: (v: string) => v?.split('T')[0] },
    { title: '项目罚款', dataIndex: 'project_penalty', render: (v: number) => `¥${v?.toLocaleString()}` },
    { title: '个人罚款', dataIndex: 'personal_penalty', render: (v: number) => `¥${v?.toLocaleString()}` },
    { title: '合计', dataIndex: 'total_penalty', render: (v: number) => <Tag color="red">¥{v?.toLocaleString()}</Tag> },
  ]

  return (
    <div>
      <Card title="合同信息" style={{ marginBottom: 16 }}>
        {contract ? (
          <Descriptions bordered column={2}>
            <Descriptions.Item label="项目名称">{contract.project_name}</Descriptions.Item>
            <Descriptions.Item label="合同编号">{contract.contract_no}</Descriptions.Item>
            <Descriptions.Item label="合同金额">¥{contract.contract_amount?.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="预付款">¥{contract.prepayment?.toLocaleString()}</Descriptions.Item>
            <Descriptions.Item label="甲方">{contract.party_a}</Descriptions.Item>
            <Descriptions.Item label="乙方">{contract.party_b}</Descriptions.Item>
          </Descriptions>
        ) : <p>暂无合同数据，请在仪表盘导入Excel数据</p>}
      </Card>
      <Card title="罚款记录">
        <Table dataSource={penalties} columns={penaltyColumns} rowKey="id" size="small" />
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: 创建 EquipmentList.tsx**

```tsx
import React, { useEffect, useState } from 'react'
import { Table, Select, Card, Tag } from 'antd'
import { equipmentApi } from '../api'

export default function EquipmentList() {
  const [categories, setCategories] = useState<any[]>([])
  const [items, setItems] = useState<any[]>([])
  const [categoryId, setCategoryId] = useState<number | undefined>()

  useEffect(() => {
    equipmentApi.categories().then(setCategories)
  }, [])

  useEffect(() => {
    equipmentApi.list(1, categoryId).then(setItems)
  }, [categoryId])

  const columns = [
    { title: '序号', dataIndex: 'seq_no', width: 80 },
    { title: '设备名称', dataIndex: 'name', width: 250 },
    { title: '规格型号', dataIndex: 'specification', width: 200 },
    { title: '单位', dataIndex: 'unit', width: 60 },
    { title: '清单工程量', dataIndex: 'contract_quantity', width: 100 },
    { title: '综合单价', dataIndex: 'unit_price', width: 100, render: (v: number) => v ? `¥${v.toFixed(2)}` : '-' },
    { title: '合同价', dataIndex: 'contract_amount', width: 120, render: (v: number) => v ? `¥${v.toLocaleString()}` : '-' },
    { title: '大类', dataIndex: 'category_name', width: 180, render: (v: string) => v ? <Tag color="blue">{v}</Tag> : '' },
    { title: '备注', dataIndex: 'remark' },
  ]

  return (
    <Card title="设备清单" extra={
      <Select
        allowClear
        placeholder="筛选大类"
        style={{ width: 250 }}
        value={categoryId}
        onChange={setCategoryId}
        options={categories.map((c: any) => ({ label: c.name, value: c.id }))}
      />
    }>
      <Table dataSource={items} columns={columns} rowKey="id" size="small" scroll={{ x: 1200 }}
        pagination={{ pageSize: 50 }} />
    </Card>
  )
}
```

---

### Task 6: 安装记录管理页面

**Files:**
- Create: `f:\kaifa\OMI\frontend\src\pages\InstallationRecords.tsx`
- Create: `f:\kaifa\OMI\frontend\src\pages\InstallationForm.tsx`

- [ ] **Step 1: 创建 InstallationRecords.tsx**

```tsx
import React, { useEffect, useState } from 'react'
import { Table, Button, Card, Space, Popconfirm, message } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { installationApi } from '../api'

export default function InstallationRecords() {
  const [records, setRecords] = useState<any[]>([])
  const navigate = useNavigate()

  const load = () => installationApi.list().then(setRecords)

  useEffect(() => { load() }, [])

  const handleDelete = async (id: number) => {
    await installationApi.delete(id)
    message.success('删除成功')
    load()
  }

  const columns = [
    { title: '编号', dataIndex: 'record_no', width: 120 },
    { title: '设备类型', dataIndex: 'equipment_type', width: 150 },
    { title: '安装人员', dataIndex: 'install_personnel', width: 200 },
    { title: '安装日期', dataIndex: 'install_date', width: 120, render: (v: string) => v?.split('T')[0] },
    { title: '使用单位', dataIndex: 'use_unit', width: 150 },
    { title: '安装内容', dataIndex: 'install_content', ellipsis: true },
    { title: '操作', width: 150, render: (_: any, r: any) => (
      <Space>
        <Button type="link" icon={<EditOutlined />} onClick={() => navigate(`/installation/${r.id}/edit`)}>编辑</Button>
        <Popconfirm title="确定删除？" onConfirm={() => handleDelete(r.id)}>
          <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
        </Popconfirm>
      </Space>
    )},
  ]

  return (
    <Card title="安装记录" extra={
      <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/installation/new')}>
        新建安装记录
      </Button>
    }>
      <Table dataSource={records} columns={columns} rowKey="id" size="small" scroll={{ x: 1000 }} />
    </Card>
  )
}
```

- [ ] **Step 2: 创建 InstallationForm.tsx**

```tsx
import React, { useEffect, useState } from 'react'
import { Form, Input, DatePicker, Button, Card, Space, message, Divider, InputNumber, Table, Select } from 'antd'
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons'
import { useNavigate, useParams } from 'react-router-dom'
import { installationApi, equipmentApi } from '../api'
import dayjs from 'dayjs'

const { TextArea } = Input

export default function InstallationForm() {
  const [form] = Form.useForm()
  const [items, setItems] = useState<any[]>([])
  const [equipment, setEquipment] = useState<any[]>([])
  const navigate = useNavigate()
  const { id } = useParams()
  const isEdit = !!id

  useEffect(() => {
    equipmentApi.list().then(setEquipment)
    if (isEdit) {
      installationApi.list().then((records: any[]) => {
        const record = records.find((r: any) => r.id === Number(id))
        if (record) {
          form.setFieldsValue({
            ...record,
            install_date: record.install_date ? dayjs(record.install_date) : undefined,
            install_sign_date: record.install_sign_date ? dayjs(record.install_sign_date) : undefined,
            client_sign_date: record.client_sign_date ? dayjs(record.client_sign_date) : undefined,
          })
          setItems(record.items || [])
        }
      })
    }
  }, [id])

  const addItem = () => {
    setItems([...items, { equipment_name: '', specification: '', unit: '', quantity: 0, location: '', remark: '' }])
  }

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx))
  }

  const updateItem = (idx: number, field: string, value: any) => {
    const updated = [...items]
    updated[idx] = { ...updated[idx], [field]: value }

    if (field === 'equipment_name' && value) {
      const eq = equipment.find((e: any) => e.name === value)
      if (eq) {
        updated[idx].specification = eq.specification || ''
        updated[idx].unit = eq.unit || ''
        updated[idx].equipment_item_id = eq.id
      }
    }
    setItems(updated)
  }

  const handleSubmit = async () => {
    const values = await form.validateFields()
    const data = {
      ...values,
      install_date: values.install_date?.format('YYYY-MM-DD'),
      install_sign_date: values.install_sign_date?.format('YYYY-MM-DD') || null,
      client_sign_date: values.client_sign_date?.format('YYYY-MM-DD') || null,
      items
    }
    try {
      if (isEdit) {
        await installationApi.update(Number(id), data)
      } else {
        await installationApi.create(data)
      }
      message.success(isEdit ? '更新成功' : '创建成功')
      navigate('/installation')
    } catch {
      message.error('保存失败')
    }
  }

  return (
    <Card title={isEdit ? '编辑安装记录' : '新建安装记录'}>
      <Form form={form} layout="vertical">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
          <Form.Item label="项目名称" name="project_name" initialValue="CX项目智能工地建设">
            <Input />
          </Form.Item>
          <Form.Item label="设备类型" name="equipment_type" rules={[{ required: true }]}>
            <Input placeholder="如：视频监控基站" />
          </Form.Item>
          <Form.Item label="安装单位" name="install_unit" initialValue="中国电信股份有限公司楚雄分公司">
            <Input />
          </Form.Item>
          <Form.Item label="安装人员" name="install_personnel" rules={[{ required: true }]}>
            <Input placeholder="如：徐家有、徐家明" />
          </Form.Item>
          <Form.Item label="安装时间" name="install_date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="使用单位" name="use_unit">
            <Input placeholder="如：C1/C2/C3/C4" />
          </Form.Item>
        </div>
        <Form.Item label="安装内容" name="install_content" rules={[{ required: true }]}>
          <TextArea rows={3} placeholder="如：厂区出入口人行闸机安装..." />
        </Form.Item>
        <Form.Item label="安装结论" name="install_conclusion" initialValue="设备已安装调试开通正常投入运行。">
          <TextArea rows={2} />
        </Form.Item>
        <Divider>安装设备明细</Divider>
        <Table
          dataSource={items.map((item, idx) => ({ ...item, _key: idx }))}
          rowKey="_key"
          size="small"
          pagination={false}
          columns={[
            {
              title: '设备名称', dataIndex: 'equipment_name', width: 220,
              render: (_: any, r: any) => (
                <Select
                  value={r.equipment_name || undefined}
                  style={{ width: '100%' }}
                  showSearch
                  placeholder="选择设备"
                  onChange={(v) => updateItem(r._key, 'equipment_name', v)}
                  options={equipment.map((e: any) => ({ label: e.name, value: e.name }))}
                  allowClear
                />
              )
            },
            {
              title: '规格型号', dataIndex: 'specification', width: 150,
              render: (_: any, r: any) => (
                <Input value={r.specification} onChange={(e) => updateItem(r._key, 'specification', e.target.value)} />
              )
            },
            {
              title: '单位', dataIndex: 'unit', width: 60,
              render: (_: any, r: any) => (
                <Input value={r.unit} onChange={(e) => updateItem(r._key, 'unit', e.target.value)} />
              )
            },
            {
              title: '数量', dataIndex: 'quantity', width: 80,
              render: (_: any, r: any) => (
                <InputNumber value={r.quantity} min={0} style={{ width: '100%' }}
                  onChange={(v) => updateItem(r._key, 'quantity', v || 0)} />
              )
            },
            {
              title: '安装位置', dataIndex: 'location', width: 120,
              render: (_: any, r: any) => (
                <Input value={r.location} onChange={(e) => updateItem(r._key, 'location', e.target.value)} />
              )
            },
            {
              title: '操作', width: 60,
              render: (_: any, r: any) => (
                <Button type="link" danger icon={<DeleteOutlined />} onClick={() => removeItem(r._key)} />
              )
            },
          ]}
          footer={() => (
            <Button type="dashed" onClick={addItem} icon={<PlusOutlined />} block>
              添加设备
            </Button>
          )}
        />
        <Divider>签字确认</Divider>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
          <Form.Item label="安装单位签字人" name="install_signatory">
            <Input />
          </Form.Item>
          <Form.Item label="签字日期" name="install_sign_date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="委托单位签字人" name="client_signatory">
            <Input />
          </Form.Item>
          <Form.Item label="签字日期" name="client_sign_date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </div>
      </Form>
      <Space style={{ marginTop: 16 }}>
        <Button type="primary" onClick={handleSubmit}>保存</Button>
        <Button onClick={() => navigate('/installation')}>取消</Button>
      </Space>
    </Card>
  )
}
```

---

### Task 7: 进度录入与工程量核对页面

**Files:**
- Create: `f:\kaifa\OMI\frontend\src\pages\ProgressEntry.tsx`
- Create: `f:\kaifa\OMI\frontend\src\pages\Verification.tsx`

- [ ] **Step 1: 创建 ProgressEntry.tsx**

```tsx
import React, { useEffect, useState } from 'react'
import { Card, Table, Button, Select, DatePicker, InputNumber, Space, message, Modal, Form } from 'antd'
import { progressApi, equipmentApi } from '../api'
import dayjs from 'dayjs'

export default function ProgressEntry() {
  const [periods, setPeriods] = useState<any[]>([])
  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null)
  const [items, setItems] = useState<any[]>([])
  const [entries, setEntries] = useState<Record<number, any>>({})
  const [modalOpen, setModalOpen] = useState(false)
  const [form] = Form.useForm()

  useEffect(() => {
    progressApi.periods().then(setPeriods)
    equipmentApi.list().then(setItems)
  }, [])

  useEffect(() => {
    if (selectedPeriod) {
      progressApi.getEntries(selectedPeriod).then((data: any[]) => {
        const map: Record<number, any> = {}
        data.forEach((e: any) => { map[e.item_id] = e })
        setEntries(map)
      })
    }
  }, [selectedPeriod])

  const updateField = (itemId: number, field: string, value: number) => {
    setEntries(prev => ({
      ...prev,
      [itemId]: { ...(prev[itemId] || { item_id: itemId }), [field]: value }
    }))
  }

  const handleSave = async () => {
    if (!selectedPeriod) return
    const data = Object.values(entries).filter((e: any) =>
      e.contractor_current > 0 || e.dept_current > 0 ||
      e.contractor_prev_cumulative > 0 || e.dept_prev_cumulative > 0
    )
    await progressApi.batchUpdate(data, selectedPeriod)
    message.success('保存成功')
  }

  const handleCreatePeriod = async () => {
    const values = await form.validateFields()
    await progressApi.createPeriod({
      period_no: values.period_no,
      start_date: values.date_range[0].format('YYYY-MM-DD'),
      end_date: values.date_range[1].format('YYYY-MM-DD'),
      entries: []
    })
    message.success('期次创建成功')
    setModalOpen(false)
    progressApi.periods().then(setPeriods)
  }

  const columns = [
    { title: '序号', dataIndex: 'seq_no', width: 60 },
    { title: '设备名称', dataIndex: 'name', width: 200 },
    { title: '规格型号', dataIndex: 'specification', width: 150 },
    { title: '单位', dataIndex: 'unit', width: 50 },
    { title: '合同量', dataIndex: 'contract_quantity', width: 80 },
    {
      title: '承包商-至上期累计', width: 120,
      render: (_: any, r: any) => (
        <InputNumber size="small" style={{ width: '100%' }} min={0}
          value={entries[r.id]?.contractor_prev_cumulative || 0}
          onChange={(v) => updateField(r.id, 'contractor_prev_cumulative', v || 0)} />
      )
    },
    {
      title: '承包商-本期完成', width: 120,
      render: (_: any, r: any) => (
        <InputNumber size="small" style={{ width: '100%' }} min={0}
          value={entries[r.id]?.contractor_current || 0}
          onChange={(v) => updateField(r.id, 'contractor_current', v || 0)} />
      )
    },
    {
      title: '承包商-至本期累计', width: 100,
      render: (_: any, r: any) => <span>{(entries[r.id]?.contractor_prev_cumulative || 0) + (entries[r.id]?.contractor_current || 0)}</span>
    },
    {
      title: '项目部-至上期累计', width: 120,
      render: (_: any, r: any) => (
        <InputNumber size="small" style={{ width: '100%' }} min={0}
          value={entries[r.id]?.dept_prev_cumulative || 0}
          onChange={(v) => updateField(r.id, 'dept_prev_cumulative', v || 0)} />
      )
    },
    {
      title: '项目部-本期完成', width: 120,
      render: (_: any, r: any) => (
        <InputNumber size="small" style={{ width: '100%' }} min={0}
          value={entries[r.id]?.dept_current || 0}
          onChange={(v) => updateField(r.id, 'dept_current', v || 0)} />
      )
    },
    {
      title: '项目部-至本期累计', width: 100,
      render: (_: any, r: any) => <span>{(entries[r.id]?.dept_prev_cumulative || 0) + (entries[r.id]?.dept_current || 0)}</span>
    },
    {
      title: '结算金额', width: 120,
      render: (_: any, r: any) => (
        <InputNumber size="small" style={{ width: '100%' }} min={0} precision={2}
          value={entries[r.id]?.settlement_amount || 0}
          onChange={(v) => updateField(r.id, 'settlement_amount', v || 0)} />
      )
    },
    {
      title: '支付金额', width: 120,
      render: (_: any, r: any) => (
        <InputNumber size="small" style={{ width: '100%' }} min={0} precision={2}
          value={entries[r.id]?.payment_amount || 0}
          onChange={(v) => updateField(r.id, 'payment_amount', v || 0)} />
      )
    },
  ]

  return (
    <Card title="进度录入" extra={
      <Space>
        <Select
          placeholder="选择期次"
          style={{ width: 250 }}
          value={selectedPeriod}
          onChange={setSelectedPeriod}
          options={periods.map((p: any) => ({ label: `第${p.period_no}期 (${p.start_date} ~ ${p.end_date})`, value: p.id }))}
        />
        <Button type="primary" onClick={() => setModalOpen(true)}>新建期次</Button>
        <Button type="primary" onClick={handleSave} disabled={!selectedPeriod}>保存</Button>
      </Space>
    }>
      <Table
        dataSource={items}
        columns={columns}
        row