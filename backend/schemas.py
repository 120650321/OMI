from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    fullname: str
    role: str = "viewer"


class UserCreate(BaseModel):
    username: str
    password: str
    fullname: str = ""
    role: str = "viewer"


class UserUpdate(BaseModel):
    username: Optional[str] = None
    password: Optional[str] = None
    fullname: Optional[str] = None
    role: Optional[str] = None


class UserOut(BaseModel):
    id: int
    username: str
    fullname: str
    role: str
    model_config = {"from_attributes": True}


class EquipmentItemOut(BaseModel):
    id: int
    contract_id: int
    category_id: Optional[int] = None
    seq_no: Optional[str] = None
    name: str
    brand: Optional[str] = None
    specification: Optional[str] = None
    unit: Optional[str] = None
    contract_quantity: float = 0
    unit_price: float = 0
    contract_amount: float = 0
    remark: Optional[str] = None
    category_name: Optional[str] = None
    model_config = {"from_attributes": True}


class EquipmentItemCreate(BaseModel):
    contract_id: int
    category_id: Optional[int] = None
    seq_no: Optional[str] = None
    name: str
    brand: Optional[str] = None
    specification: Optional[str] = None
    unit: Optional[str] = None
    contract_quantity: float = 0
    unit_price: float = 0
    contract_amount: float = 0
    remark: Optional[str] = None


class EquipmentItemUpdate(BaseModel):
    category_id: Optional[int] = None
    seq_no: Optional[str] = None
    name: Optional[str] = None
    brand: Optional[str] = None
    specification: Optional[str] = None
    unit: Optional[str] = None
    contract_quantity: Optional[float] = None
    unit_price: Optional[float] = None
    contract_amount: Optional[float] = None
    remark: Optional[str] = None


class EquipmentCategoryCreate(BaseModel):
    contract_id: int
    seq_no: Optional[str] = None
    name: str
    sort_order: int = 0
    tax_rate: float = 0.13


class EquipmentCategoryUpdate(BaseModel):
    seq_no: Optional[str] = None
    name: Optional[str] = None
    sort_order: Optional[int] = None
    tax_rate: Optional[float] = None


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
    actual_paid_amount: float = 0


class ProgressPeriodCreate(BaseModel):
    period_no: int
    start_date: date
    end_date: date
    entries: List[ProgressEntryIn] = []


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
    actual_paid_amount: float = 0
    item_name: Optional[str] = None
    item_spec: Optional[str] = None
    item_unit: Optional[str] = None
    item_contract_qty: float = 0
    item_unit_price: float = 0
    model_config = {"from_attributes": True}


class InstallationRecordItemIn(BaseModel):
    equipment_item_id: Optional[int] = None
    equipment_name: str = ""
    specification: Optional[str] = None
    unit: Optional[str] = None
    quantity: float = 0
    location: Optional[str] = None
    remark: Optional[str] = None
    images: Optional[str] = None


class InstallationRecordCreate(BaseModel):
    contract_id: Optional[int] = None
    record_no: Optional[str] = None
    project_name: str = "CX项目智能工地建设"
    equipment_type: str = ""
    install_unit: str = "中国电信股份有限公司楚雄分公司"
    install_personnel: str = ""
    install_date: date
    use_unit: Optional[str] = None
    install_content: str = ""
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
    period_label: str = ""
    images: Optional[str] = None
    created_at: datetime
    items: List[InstallationRecordItemIn] = []
    model_config = {"from_attributes": True}