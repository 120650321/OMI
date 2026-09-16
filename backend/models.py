from sqlalchemy import Column, Integer, String, Float, Boolean, Date, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from database import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False)
    hashed_password = Column(String(200), nullable=False)
    fullname = Column(String(50), default="")
    role = Column(String(20), default="viewer", nullable=False)


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
    tax_rate = Column(Float, default=0.13)  # 增值税率: 系统集成6%, 设备13%


class EquipmentItem(Base):
    __tablename__ = "equipment_items"
    id = Column(Integer, primary_key=True, autoincrement=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    category_id = Column(Integer, ForeignKey("equipment_categories.id"))
    seq_no = Column(String(20))
    name = Column(String(200), nullable=False)
    brand = Column(String(200))
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
    actual_paid_amount = Column(Float, default=0)  # 实际支付金额
    period = relationship("ProgressPeriod", backref="entries")
    item = relationship("EquipmentItem", backref="progress_entries")


class InstallationRecord(Base):
    __tablename__ = "installation_records"
    id = Column(Integer, primary_key=True, autoincrement=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=True)
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
    period_id = Column(Integer, ForeignKey("progress_periods.id"), nullable=True)
    period = relationship("ProgressPeriod", backref="installation_records")
    created_at = Column(DateTime, default=datetime.now)
    images = Column(Text)
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
    images = Column(Text)


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


class SettlementSummary(Base):
    """按期次的结算汇总（对应审批单）"""
    __tablename__ = "settlement_summaries"
    id = Column(Integer, primary_key=True, autoincrement=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    period_id = Column(Integer, ForeignKey("progress_periods.id"), nullable=False)
    approval_no = Column(String(100), default="CXGCLH-ZNGD-SJHT")
    # 本期结算金额（含税）
    total_settlement_tax = Column(Float, default=0)
    # 本期结算金额（不含税）
    total_settlement_no_tax = Column(Float, default=0)
    tax_amount = Column(Float, default=0)
    # 扣抵款项
    deduction_prepayment = Column(Float, default=0)  # 预付款扣抵
    deduction_warranty = Column(Float, default=0)    # 质保金 = 结算*10%
    # 支付
    payment_amount = Column(Float, default=0)         # 实际支付 = 结算-预付款-质保金
    payment_ratio = Column(Float, default=0)          # 支付比例
    warranty_rate = Column(Float, default=0.10)       # 质保金比率 10%
    created_at = Column(DateTime, default=datetime.now)
    period = relationship("ProgressPeriod", backref="settlement")


class WorkUnit(Base):
    """可配置的使用单位（C1/C2/C3/C4/EPC 等）"""
    __tablename__ = "work_units"
    id = Column(Integer, primary_key=True, autoincrement=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    name = Column(String(50), nullable=False)
    sort_order = Column(Integer, default=0)


class DeviceUnitAllocation(Base):
    """设备对使用单位的分配量"""
    __tablename__ = "device_unit_allocations"
    id = Column(Integer, primary_key=True, autoincrement=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    equipment_item_id = Column(Integer, ForeignKey("equipment_items.id"), nullable=False)
    use_unit = Column(String(50), nullable=False)
    allocated_qty = Column(Float, default=0)


class InstallPersonnel(Base):
    """安装人员管理"""
    __tablename__ = "install_personnel"
    id = Column(Integer, primary_key=True, autoincrement=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    name = Column(String(50), nullable=False)
    is_default = Column(Boolean, default=False)
    sort_order = Column(Integer, default=0)


class InstallSkip(Base):
    """设备安装 - 暂不录入标记"""
    __tablename__ = "install_skips"
    id = Column(Integer, primary_key=True, autoincrement=True)
    contract_id = Column(Integer, ForeignKey("contracts.id"), nullable=False)
    period_id = Column(Integer, ForeignKey("progress_periods.id"), nullable=False)
    equipment_item_id = Column(Integer, ForeignKey("equipment_items.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.now)