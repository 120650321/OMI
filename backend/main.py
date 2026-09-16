from fastapi import FastAPI, Depends, HTTPException, Query, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse, Response, StreamingResponse
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
import database, models, schemas
import os, shutil

SECRET_KEY = "ynzk-2024-omi-secret-key-change-in-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

app = FastAPI(title="智能工地结算安装记录核对系统")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== Auth Middleware ====================
SKIP_AUTH_PATHS = {"/api/auth/login", "/docs", "/openapi.json", "/favicon.ico"}

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    if path in SKIP_AUTH_PATHS or path.startswith("/uploads") or request.method == "OPTIONS":
        return await call_next(request)

    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return JSONResponse(status_code=401, content={"detail": "未登录，请先登录"})

    token = auth_header.replace("Bearer ", "")
    db = database.SessionLocal()
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if not username:
            return JSONResponse(status_code=401, content={"detail": "令牌无效"})
    except JWTError:
        return JSONResponse(status_code=401, content={"detail": "令牌无效或已过期"})
    finally:
        db.close()

    return await call_next(request)


UPLOAD_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.on_event("startup")
def on_startup():
    database.init_db()
    import sqlite3
    db_path = os.path.join(os.path.dirname(__file__), "settlement.db")
    raw = sqlite3.connect(db_path)
    try:
        cols = [r[1] for r in raw.execute("PRAGMA table_info(users)").fetchall()]
        if 'role' not in cols:
            raw.execute("ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'viewer'")
            raw.commit()
        progress_cols = [r[1] for r in raw.execute("PRAGMA table_info(progress_entries)").fetchall()]
        if 'actual_paid_amount' not in progress_cols:
            raw.execute("ALTER TABLE progress_entries ADD COLUMN actual_paid_amount FLOAT NOT NULL DEFAULT 0")
            raw.commit()
        inst_cols = [r[1] for r in raw.execute("PRAGMA table_info(installation_records)").fetchall()]
        if 'contract_id' not in inst_cols:
            raw.execute("ALTER TABLE installation_records ADD COLUMN contract_id INTEGER REFERENCES contracts(id)")
            raw.commit()
        raw.execute("UPDATE installation_records SET contract_id = 1 WHERE contract_id IS NULL")
        raw.commit()
    finally:
        raw.close()
    db = database.SessionLocal()
    if not db.query(models.User).filter(models.User.username == "admin").first():
        db.add(models.User(
            username="admin",
            hashed_password=pwd_context.hash("admin123"),
            fullname="系统管理员",
            role="admin"
        ))
        db.commit()
    else:
        admin = db.query(models.User).filter(models.User.username == "admin").first()
        if admin and admin.role != "admin":
            admin.role = "admin"
            db.commit()
    # Seed default work units
    if not db.query(models.WorkUnit).first():
        for i, name in enumerate(["C1", "C2", "C3", "C4", "EPC"]):
            db.add(models.WorkUnit(contract_id=1, name=name, sort_order=i))
        db.commit()
    db.close()


# ==================== Auth ====================
@app.post("/api/auth/login", response_model=schemas.TokenResponse)
def login(data: schemas.LoginRequest, db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.username == data.username).first()
    if not user or not pwd_context.verify(data.password, user.hashed_password):
        raise HTTPException(401, "用户名或密码错误")
    token_data = {"sub": user.username, "exp": datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)}
    token = jwt.encode(token_data, SECRET_KEY, algorithm=ALGORITHM)
    return {"access_token": token, "token_type": "bearer", "username": user.username, "fullname": user.fullname, "role": user.role or "viewer"}


@app.get("/api/auth/me")
def read_current_user(request: Request, db: Session = Depends(database.get_db)):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(401, "未登录")
    token = auth_header.replace("Bearer ", "")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        user = db.query(models.User).filter(models.User.username == username).first()
        if not user:
            raise HTTPException(401, "用户不存在")
        return {"username": user.username, "fullname": user.fullname, "role": user.role or "viewer"}
    except JWTError:
        raise HTTPException(401, "令牌无效")


def get_current_user(request: Request, db: Session = Depends(database.get_db)) -> models.User:
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(401, "未登录")
    token = auth_header.replace("Bearer ", "")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        user = db.query(models.User).filter(models.User.username == username).first()
        if not user:
            raise HTTPException(401, "用户不存在")
        return user
    except JWTError:
        raise HTTPException(401, "令牌无效")


def require_admin(current_user: models.User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(403, "权限不足，仅管理员可操作")
    return current_user


def require_write(current_user: models.User = Depends(get_current_user)):
    if current_user.role == "viewer":
        raise HTTPException(403, "权限不足，观察员仅有查看权限")
    return current_user


ROLE_LABELS = {"admin": "系统管理员", "operator": "操作员", "viewer": "观察员"}


@app.get("/api/users")
def list_users(
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(database.get_db)
):
    users = db.query(models.User).order_by(models.User.id).all()
    return [{"id": u.id, "username": u.username, "fullname": u.fullname,
             "role": u.role or "viewer", "role_label": ROLE_LABELS.get(u.role or "viewer", u.role)}
            for u in users]


@app.post("/api/users")
def create_user(
    data: schemas.UserCreate,
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(database.get_db)
):
    existing = db.query(models.User).filter(models.User.username == data.username).first()
    if existing:
        raise HTTPException(400, "用户名已存在")
    user = models.User(
        username=data.username,
        hashed_password=pwd_context.hash(data.password),
        fullname=data.fullname or "",
        role=data.role or "viewer"
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "username": user.username, "fullname": user.fullname,
            "role": user.role, "role_label": ROLE_LABELS.get(user.role, user.role)}


@app.put("/api/users/{user_id}")
def update_user(
    user_id: int,
    data: schemas.UserUpdate,
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(database.get_db)
):
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "用户不存在")
    if user.id == current_user.id and data.role and data.role != "admin":
        raise HTTPException(400, "不能取消自己的管理员权限")
    if data.username is not None:
        dup = db.query(models.User).filter(
            models.User.username == data.username,
            models.User.id != user_id
        ).first()
        if dup:
            raise HTTPException(400, "用户名已存在")
        user.username = data.username
    if data.password is not None and data.password:
        user.hashed_password = pwd_context.hash(data.password)
    if data.fullname is not None:
        user.fullname = data.fullname
    if data.role is not None:
        user.role = data.role
    db.commit()
    return {"status": "ok", "message": "用户更新成功"}


@app.delete("/api/users/{user_id}")
def delete_user(
    user_id: int,
    current_user: models.User = Depends(require_admin),
    db: Session = Depends(database.get_db)
):
    if user_id == current_user.id:
        raise HTTPException(400, "不能删除自己")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(404, "用户不存在")
    db.delete(user)
    db.commit()
    return {"status": "ok", "message": f"用户 {user.username} 已删除"}


# ==================== Contract ====================
@app.get("/api/contracts")
def list_contracts(db: Session = Depends(database.get_db)):
    return db.query(models.Contract).all()


@app.post("/api/contracts")
def create_contract(data: dict, db: Session = Depends(database.get_db), _: models.User = Depends(require_write)):
    c = models.Contract(**data)
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@app.put("/api/contracts/{contract_id}")
def update_contract(contract_id: int, data: dict, db: Session = Depends(database.get_db), _: models.User = Depends(require_write)):
    c = db.query(models.Contract).filter(models.Contract.id == contract_id).first()
    if not c:
        raise HTTPException(404, "合同不存在")
    for key, value in data.items():
        setattr(c, key, value)
    db.commit()
    db.refresh(c)
    return c


@app.delete("/api/contracts/{contract_id}")
def delete_contract(contract_id: int, db: Session = Depends(database.get_db), _: models.User = Depends(require_write)):
    c = db.query(models.Contract).filter(models.Contract.id == contract_id).first()
    if not c:
        raise HTTPException(404, "合同不存在")
    db.delete(c)
    db.commit()
    return {"status": "ok"}


# ==================== Equipment Items ====================
@app.get("/api/equipment-items")
def list_equipment_items(
    contract_id: int = Query(1),
    category_id: Optional[int] = None,
    db: Session = Depends(database.get_db)
):
    q = db.query(models.EquipmentItem).filter(
        models.EquipmentItem.contract_id == contract_id
    )
    if category_id:
        q = q.filter(models.EquipmentItem.category_id == category_id)
    items = q.order_by(models.EquipmentItem.id).all()
    result = []
    for item in items:
        d = schemas.EquipmentItemOut(
            id=item.id, contract_id=item.contract_id, category_id=item.category_id,
            seq_no=item.seq_no, name=item.name, brand=item.brand, specification=item.specification,
            unit=item.unit, contract_quantity=item.contract_quantity,
            unit_price=item.unit_price, contract_amount=item.contract_amount,
            remark=item.remark,
            category_name=item.category.name if item.category else None
        )
        result.append(d)
    return result


@app.get("/api/equipment-categories")
def list_categories(contract_id: int = Query(1), db: Session = Depends(database.get_db)):
    return db.query(models.EquipmentCategory).filter(
        models.EquipmentCategory.contract_id == contract_id
    ).order_by(models.EquipmentCategory.sort_order).all()


@app.post("/api/equipment-categories")
def create_category(
    data: schemas.EquipmentCategoryCreate,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_write)
):
    cat = models.EquipmentCategory(**data.model_dump())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return {"id": cat.id, "contract_id": cat.contract_id, "seq_no": cat.seq_no,
            "name": cat.name, "sort_order": cat.sort_order, "tax_rate": cat.tax_rate}


@app.put("/api/equipment-categories/{category_id}")
def update_category(
    category_id: int,
    data: schemas.EquipmentCategoryUpdate,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_write)
):
    cat = db.query(models.EquipmentCategory).filter(models.EquipmentCategory.id == category_id).first()
    if not cat:
        raise HTTPException(404, "大类不存在")
    for key, value in data.model_dump(exclude_none=True).items():
        setattr(cat, key, value)
    db.commit()
    db.refresh(cat)
    return {"id": cat.id, "contract_id": cat.contract_id, "seq_no": cat.seq_no,
            "name": cat.name, "sort_order": cat.sort_order, "tax_rate": cat.tax_rate}


@app.delete("/api/equipment-categories/{category_id}")
def delete_category(
    category_id: int,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_write)
):
    cat = db.query(models.EquipmentCategory).filter(models.EquipmentCategory.id == category_id).first()
    if not cat:
        raise HTTPException(404, "大类不存在")
    db.delete(cat)
    db.commit()
    return {"status": "ok"}


@app.post("/api/equipment-items")
def create_equipment_item(
    data: schemas.EquipmentItemCreate,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_write)
):
    item = models.EquipmentItem(**data.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    cat_name = item.category.name if item.category else None
    return {
        "id": item.id, "contract_id": item.contract_id, "category_id": item.category_id,
        "seq_no": item.seq_no, "name": item.name, "specification": item.specification,
        "unit": item.unit, "contract_quantity": item.contract_quantity,
        "unit_price": item.unit_price, "contract_amount": item.contract_amount,
        "remark": item.remark, "category_name": cat_name
    }


@app.put("/api/equipment-items/{item_id}")
def update_equipment_item(
    item_id: int,
    data: schemas.EquipmentItemUpdate,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_write)
):
    item = db.query(models.EquipmentItem).filter(models.EquipmentItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "设备项不存在")
    for key, value in data.model_dump(exclude_none=True).items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    cat_name = item.category.name if item.category else None
    return {
        "id": item.id, "contract_id": item.contract_id, "category_id": item.category_id,
        "seq_no": item.seq_no, "name": item.name, "specification": item.specification,
        "unit": item.unit, "contract_quantity": item.contract_quantity,
        "unit_price": item.unit_price, "contract_amount": item.contract_amount,
        "remark": item.remark, "category_name": cat_name
    }


@app.delete("/api/equipment-items/{item_id}")
def delete_equipment_item(
    item_id: int,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_write)
):
    item = db.query(models.EquipmentItem).filter(models.EquipmentItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "设备项不存在")
    db.delete(item)
    db.commit()
    return {"status": "ok"}


# ==================== Progress Periods ====================
@app.get("/api/progress-periods")
def list_periods(contract_id: int = Query(1), db: Session = Depends(database.get_db)):
    return db.query(models.ProgressPeriod).filter(
        models.ProgressPeriod.contract_id == contract_id
    ).order_by(models.ProgressPeriod.period_no).all()


@app.post("/api/progress-periods")
def create_period(
    data: schemas.ProgressPeriodCreate,
    contract_id: int = Query(1),
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_write)
):
    period = models.ProgressPeriod(
        contract_id=contract_id,
        period_no=data.period_no,
        start_date=data.start_date,
        end_date=data.end_date
    )
    db.add(period)
    db.flush()

    if data.entries:
        for entry_data in data.entries:
            entry = models.ProgressEntry(period_id=period.id, **entry_data.model_dump())
            db.add(entry)
    else:
        prev_period = db.query(models.ProgressPeriod).filter(
            models.ProgressPeriod.contract_id == contract_id,
            models.ProgressPeriod.period_no == data.period_no - 1
        ).first()
        prev_entries = {}
        if prev_period:
            for pe in prev_period.entries:
                prev_entries[pe.item_id] = pe
        items = db.query(models.EquipmentItem).filter(
            models.EquipmentItem.contract_id == contract_id
        ).all()
        for item in items:
            prev_entry = prev_entries.get(item.id)
            entry = models.ProgressEntry(
                period_id=period.id,
                item_id=item.id,
                contractor_prev_cumulative=prev_entry.contractor_total_cumulative if prev_entry else 0,
                contractor_current=0,
                contractor_total_cumulative=0,
                dept_prev_cumulative=prev_entry.dept_total_cumulative if prev_entry else 0,
                dept_current=0,
                dept_total_cumulative=0,
                settlement_amount=0,
                payment_amount=0,
                actual_paid_amount=0
            )
            db.add(entry)

    db.commit()
    db.refresh(period)
    return {"id": period.id, "status": "ok"}


@app.delete("/api/progress-periods/{period_id}")
def delete_period(period_id: int, db: Session = Depends(database.get_db), _: models.User = Depends(require_write)):
    period = db.query(models.ProgressPeriod).filter(
        models.ProgressPeriod.id == period_id
    ).first()
    if not period:
        raise HTTPException(404, "期次不存在")
    db.query(models.ProgressEntry).filter(
        models.ProgressEntry.period_id == period_id
    ).delete()
    db.query(models.SettlementSummary).filter(
        models.SettlementSummary.period_id == period_id
    ).delete()
    db.query(models.InstallationRecord).filter(
        models.InstallationRecord.period_id == period_id
    ).update({"period_id": None})
    db.delete(period)
    db.commit()
    return {"status": "ok", "message": f"第{period.period_no}期已删除"}


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
            payment_amount=e.payment_amount,
            actual_paid_amount=e.actual_paid_amount
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
def batch_update_entries(
    entries: List[schemas.ProgressEntryIn],
    period_id: int,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_write)
):
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


# ==================== Installation Records ====================
@app.get("/api/installation-records")
def list_records(contract_id: Optional[int] = None, db: Session = Depends(database.get_db)):
    q = db.query(models.InstallationRecord)
    if contract_id:
        q = q.filter(models.InstallationRecord.contract_id == contract_id)
    records = q.order_by(
        models.InstallationRecord.install_date.desc()
    ).all()
    result = []
    for r in records:
        period_label = f"第{r.period.period_no}期" if r.period else ""
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
            period_label=period_label,
            images=r.images,
            created_at=r.created_at,
            items=[]
        )
        for ri in r.items:
            d.items.append(schemas.InstallationRecordItemIn(
                equipment_item_id=ri.equipment_item_id,
                equipment_name=ri.equipment_name,
                specification=ri.specification,
                unit=ri.unit, quantity=ri.quantity,
                location=ri.location, remark=ri.remark,
                images=ri.images
            ))
        result.append(d)
    return result


@app.post("/api/installation-records")
def create_record(data: schemas.InstallationRecordCreate, db: Session = Depends(database.get_db), _: models.User = Depends(require_write)):
    count = db.query(models.InstallationRecord).count()
    record = models.InstallationRecord(
        contract_id=data.contract_id,
        record_no=data.record_no or f"CX-{count + 1:04d}",
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
        db.add(models.InstallationRecordItem(
            record_id=record.id, **item_data.model_dump(exclude_none=True)
        ))
    db.commit()
    db.refresh(record)
    return {"id": record.id, "status": "ok"}


@app.put("/api/installation-records/{record_id}")
def update_record(record_id: int, data: schemas.InstallationRecordCreate, db: Session = Depends(database.get_db), _: models.User = Depends(require_write)):
    record = db.query(models.InstallationRecord).filter(
        models.InstallationRecord.id == record_id
    ).first()
    if not record:
        raise HTTPException(404, "记录不存在")
    for field in ["project_name", "equipment_type", "install_unit", "install_personnel",
                  "install_date", "use_unit", "install_content", "install_conclusion",
                  "install_signatory", "install_sign_date", "client_signatory", "client_sign_date"]:
        setattr(record, field, getattr(data, field))
    db.query(models.InstallationRecordItem).filter(
        models.InstallationRecordItem.record_id == record_id
    ).delete()
    for item_data in data.items:
        db.add(models.InstallationRecordItem(
            record_id=record_id, **item_data.model_dump(exclude_none=True)
        ))
    db.commit()
    return {"status": "ok"}


@app.delete("/api/installation-records/{record_id}")
def delete_record(record_id: int, db: Session = Depends(database.get_db), _: models.User = Depends(require_write)):
    record = db.query(models.InstallationRecord).filter(
        models.InstallationRecord.id == record_id
    ).first()
    if not record:
        raise HTTPException(404, "安装记录不存在")
    db.delete(record)
    db.commit()
    return {"status": "ok"}


@app.post("/api/installation-records/batch-delete")
def batch_delete_records(data: dict, db: Session = Depends(database.get_db), _: models.User = Depends(require_write)):
    ids = data.get("ids", [])
    if not ids:
        raise HTTPException(400, "请选择要删除的记录")
    records = db.query(models.InstallationRecord).filter(
        models.InstallationRecord.id.in_(ids)
    ).all()
    if not records:
        raise HTTPException(404, "未找到匹配的记录")
    deleted_count = len(records)
    for record in records:
        db.delete(record)
    db.commit()
    return {"status": "ok", "deleted": deleted_count}


# ==================== Install Skip ====================
@app.get("/api/install-skip")
def list_install_skips(
    contract_id: int = Query(1),
    period_id: int = Query(...),
    db: Session = Depends(database.get_db)
):
    skips = db.query(models.InstallSkip).filter(
        models.InstallSkip.contract_id == contract_id,
        models.InstallSkip.period_id == period_id
    ).all()
    return [s.equipment_item_id for s in skips]


@app.post("/api/install-skip")
def mark_install_skip(
    item_ids: List[int],
    contract_id: int = Query(1),
    period_id: int = Query(...),
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_write)
):
    existing = set(
        s.equipment_item_id for s in db.query(models.InstallSkip).filter(
            models.InstallSkip.contract_id == contract_id,
            models.InstallSkip.period_id == period_id,
            models.InstallSkip.equipment_item_id.in_(item_ids)
        ).all()
    )
    for item_id in item_ids:
        if item_id not in existing:
            db.add(models.InstallSkip(
                contract_id=contract_id,
                period_id=period_id,
                equipment_item_id=item_id
            ))
    db.commit()
    return {"status": "ok"}


@app.delete("/api/install-skip")
def unmark_install_skip(
    item_ids: List[int],
    contract_id: int = Query(1),
    period_id: int = Query(...),
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_write)
):
    db.query(models.InstallSkip).filter(
        models.InstallSkip.contract_id == contract_id,
        models.InstallSkip.period_id == period_id,
        models.InstallSkip.equipment_item_id.in_(item_ids)
    ).delete(synchronize_session=False)
    db.commit()
    return {"status": "ok"}


# ==================== Installation: Progress-Linked ====================
@app.get("/api/installation/unrecorded-items")
def get_unrecorded_items(contract_id: int = Query(1), period_id: Optional[int] = None, db: Session = Depends(database.get_db)):
    """获取指定期次（或全部期次）中进度有完成量但尚未录入安装记录的设备清单"""
    items = db.query(models.EquipmentItem).filter(
        models.EquipmentItem.contract_id == contract_id
    ).order_by(models.EquipmentItem.id).all()

    skipped_ids = set()
    if period_id:
        skipped_ids = set(
            s.equipment_item_id for s in db.query(models.InstallSkip).filter(
                models.InstallSkip.contract_id == contract_id,
                models.InstallSkip.period_id == period_id
            ).all()
        )

    if period_id:
        all_progress = db.query(models.ProgressEntry).filter(
            models.ProgressEntry.period_id == period_id
        ).all()
    else:
        all_progress = db.query(models.ProgressEntry).all()

    progress_by_item = {}
    for pe in all_progress:
        if pe.item_id not in progress_by_item:
            progress_by_item[pe.item_id] = 0.0
        progress_by_item[pe.item_id] += (pe.contractor_current or 0) + (pe.contractor_prev_cumulative or 0)

    result = []
    for item in items:
        cat = item.category
        installed_qty = sum(
            ri.quantity for ri in db.query(models.InstallationRecordItem).filter(
                models.InstallationRecordItem.equipment_item_id == item.id
            ).all()
        )
        progress_qty = progress_by_item.get(item.id, 0)
        result.append({
            "item_id": item.id,
            "item_name": item.name,
            "specification": item.specification or "",
            "unit": item.unit or "",
            "contract_quantity": item.contract_quantity,
            "unit_price": item.unit_price,
            "contract_amount": item.contract_amount,
            "category_name": cat.name if cat else "",
            "progress_quantity": progress_qty,
            "installed_quantity": installed_qty,
            "uninstalled_quantity": max(0, progress_qty - installed_qty),
            "is_recorded": installed_qty > 0,
            "skip_install": item.id in skipped_ids,
        })
    return result


@app.post("/api/installation/generate-from-progress")
def generate_from_progress(contract_id: int = Query(1), period_id: Optional[int] = None, db: Session = Depends(database.get_db), _: models.User = Depends(require_write)):
    """根据指定期次的进度数据自动生成安装记录表（每次查询最新数据库状态，保证数据实时联动）"""
    items = db.query(models.EquipmentItem).filter(
        models.EquipmentItem.contract_id == contract_id
    ).order_by(models.EquipmentItem.id).all()

    if period_id:
        all_progress = db.query(models.ProgressEntry).filter(
            models.ProgressEntry.period_id == period_id
        ).all()
    else:
        all_progress = db.query(models.ProgressEntry).all()

    progress_by_item = {}
    for pe in all_progress:
        if pe.item_id not in progress_by_item:
            progress_by_item[pe.item_id] = 0.0
        progress_by_item[pe.item_id] += (pe.contractor_current or 0)

    generated_items = []
    if period_id:
        skipped_ids = set(
            s.equipment_item_id for s in db.query(models.InstallSkip).filter(
                models.InstallSkip.contract_id == contract_id,
                models.InstallSkip.period_id == period_id
            ).all()
        )
    else:
        skipped_ids = set()
    for item in items:
        if item.id in skipped_ids:
            continue
        needed = progress_by_item.get(item.id, 0)
        already = sum(
            ri.quantity for ri in db.query(models.InstallationRecordItem).filter(
                models.InstallationRecordItem.equipment_item_id == item.id
            ).all()
        )
        remaining = needed - already
        if remaining > 0:
            generated_items.append({
                "equipment_item_id": item.id,
                "equipment_name": item.name,
                "specification": item.specification or "",
                "unit": item.unit or "",
                "quantity": round(remaining, 2),
                "location": "",
                "remark": "",
            })

    if not generated_items:
        has_progress = any(progress_by_item.get(item.id, 0) > 0 for item in items if item.id not in skipped_ids)
        if period_id:
            period = db.query(models.ProgressPeriod).filter(models.ProgressPeriod.id == period_id).first()
            period_label = f"第{period.period_no}期" if period else "指定期次"
        else:
            period_label = "全部期次"
        if has_progress:
            raise HTTPException(400, f"{period_label}的所有进度设备已录入安装记录，无需生成")
        raise HTTPException(400, f"{period_label}暂未录入进度数据，请先在进度录入中录入核定数据")

    from datetime import date
    count = db.query(models.InstallationRecord).count()
    period = db.query(models.ProgressPeriod).filter(models.ProgressPeriod.id == period_id).first() if period_id else None
    period_label = f"第{period.period_no}期" if period else "全部期次"
    content = f"根据{period_label}进度核定数据自动生成的安装记录"
    record = models.InstallationRecord(
        contract_id=contract_id,
        record_no=f"CX-{count + 1:04d}",
        project_name="CX项目智能工地建设",
        equipment_type="智能工地设备",
        install_unit="中国电信股份有限公司楚雄分公司",
        install_personnel="",
        install_date=date.today(),
        use_unit="楚雄国储龙慧项目部",
        install_content=content,
        install_conclusion="",
        period_id=period_id,
    )
    db.add(record)
    db.flush()
    for it in generated_items:
        db.add(models.InstallationRecordItem(record_id=record.id, **it))
    db.commit()
    db.refresh(record)
    return {"id": record.id, "record_no": record.record_no, "item_count": len(generated_items)}


@app.post("/api/installation/generate-selected")
def generate_selected(
    item_ids: List[int] = None,
    contract_id: int = Query(1),
    period_id: Optional[int] = None,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_write)
):
    """勾选多台设备合并生成一张安装记录表"""
    from fastapi import Body
    if not item_ids:
        raise HTTPException(400, "请选择至少一台设备")

    if period_id:
        skipped_ids = set(
            s.equipment_item_id for s in db.query(models.InstallSkip).filter(
                models.InstallSkip.contract_id == contract_id,
                models.InstallSkip.period_id == period_id
            ).all()
        )
    else:
        skipped_ids = set()

    all_progress = db.query(models.ProgressEntry)
    if period_id:
        all_progress = all_progress.filter(models.ProgressEntry.period_id == period_id)
    all_progress = all_progress.all()

    progress_by_item = {}
    for pe in all_progress:
        if pe.item_id not in progress_by_item:
            progress_by_item[pe.item_id] = 0.0
        progress_by_item[pe.item_id] += (pe.contractor_current or 0)

    generated_items = []
    for item_id in item_ids:
        if item_id in skipped_ids:
            continue
        item = db.query(models.EquipmentItem).filter(
            models.EquipmentItem.id == item_id,
            models.EquipmentItem.contract_id == contract_id
        ).first()
        if not item:
            continue
        needed = progress_by_item.get(item.id, 0)
        already = sum(
            ri.quantity for ri in db.query(models.InstallationRecordItem).filter(
                models.InstallationRecordItem.equipment_item_id == item.id
            ).all()
        )
        remaining = needed - already
        if remaining > 0:
            generated_items.append({
                "equipment_item_id": item.id,
                "equipment_name": item.name,
                "specification": item.specification or "",
                "unit": item.unit or "",
                "quantity": round(remaining, 2),
                "location": "",
                "remark": "",
            })

    if not generated_items:
        raise HTTPException(400, "所选设备已全部录入安装记录")

    from datetime import date
    count = db.query(models.InstallationRecord).count()
    period = db.query(models.ProgressPeriod).filter(models.ProgressPeriod.id == period_id).first() if period_id else None
    period_label = f"第{period.period_no}期" if period else ""
    names = ", ".join([it["equipment_name"] for it in generated_items[:3]])
    if len(generated_items) > 3:
        names += f"等{len(generated_items)}项"
    content = f"根据{period_label}进度核定数据生成的安装记录: {names}" if period_label else f"根据进度核定数据生成的安装记录: {names}"
    record = models.InstallationRecord(
        contract_id=contract_id,
        record_no=f"CX-{count + 1:04d}",
        project_name="CX项目智能工地建设",
        equipment_type="智能工地设备",
        install_unit="中国电信股份有限公司楚雄分公司",
        install_personnel="",
        install_date=date.today(),
        use_unit="楚雄国储龙慧项目部",
        install_content=content,
        install_conclusion="",
        period_id=period_id,
    )
    db.add(record)
    db.flush()
    for it in generated_items:
        db.add(models.InstallationRecordItem(record_id=record.id, **it))
    db.commit()
    db.refresh(record)
    return {"id": record.id, "record_no": record.record_no, "item_count": len(generated_items)}


@app.post("/api/installation/generate-individual")
def generate_individual(
    item_ids: List[int] = None,
    contract_id: int = Query(1),
    period_id: Optional[int] = None,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_write)
):
    """逐项生成独立安装记录表，每台设备一张"""
    from fastapi import Body
    if not item_ids:
        raise HTTPException(400, "请选择至少一台设备")

    if period_id:
        skipped_ids = set(
            s.equipment_item_id for s in db.query(models.InstallSkip).filter(
                models.InstallSkip.contract_id == contract_id,
                models.InstallSkip.period_id == period_id
            ).all()
        )
    else:
        skipped_ids = set()

    all_progress = db.query(models.ProgressEntry)
    if period_id:
        all_progress = all_progress.filter(models.ProgressEntry.period_id == period_id)
    all_progress = all_progress.all()

    progress_by_item = {}
    for pe in all_progress:
        if pe.item_id not in progress_by_item:
            progress_by_item[pe.item_id] = 0.0
        progress_by_item[pe.item_id] += (pe.contractor_current or 0)

    from datetime import date
    count = db.query(models.InstallationRecord).count()
    period = db.query(models.ProgressPeriod).filter(models.ProgressPeriod.id == period_id).first() if period_id else None
    period_label = f"第{period.period_no}期" if period else ""
    created = []

    for item_id in item_ids:
        if item_id in skipped_ids:
            continue
        item = db.query(models.EquipmentItem).filter(
            models.EquipmentItem.id == item_id,
            models.EquipmentItem.contract_id == contract_id
        ).first()
        if not item:
            continue
        needed = progress_by_item.get(item.id, 0)
        already = sum(
            ri.quantity for ri in db.query(models.InstallationRecordItem).filter(
                models.InstallationRecordItem.equipment_item_id == item.id
            ).all()
        )
        remaining = needed - already
        if remaining <= 0:
            continue

        count += 1
        content = f"根据{period_label}进度核定数据生成的安装记录: {item.name}" if period_label else f"根据进度核定数据生成的安装记录: {item.name}"
        record = models.InstallationRecord(
            contract_id=contract_id,
            record_no=f"CX-{count:04d}",
            project_name="CX项目智能工地建设",
            equipment_type="智能工地设备",
            install_unit="中国电信股份有限公司楚雄分公司",
            install_personnel="",
            install_date=date.today(),
            use_unit="楚雄国储龙慧项目部",
            install_content=content,
            install_conclusion="",
            period_id=period_id,
        )
        db.add(record)
        db.flush()
        db.add(models.InstallationRecordItem(
            record_id=record.id,
            equipment_item_id=item.id,
            equipment_name=item.name,
            specification=item.specification or "",
            unit=item.unit or "",
            quantity=round(remaining, 2),
            location="",
            remark="",
        ))
        created.append({"id": record.id, "record_no": record.record_no, "item_name": item.name})

    if not created:
        raise HTTPException(400, "所选设备已全部录入安装记录")

    db.commit()
    return {"records": created, "total": len(created)}


# ==================== 使用单位 & 设备分配 ====================
@app.get("/api/use-units")
def get_use_units(contract_id: int = Query(1), db: Session = Depends(database.get_db)):
    units = db.query(models.WorkUnit).filter(models.WorkUnit.contract_id == contract_id).order_by(models.WorkUnit.sort_order).all()
    return [{"id": u.id, "name": u.name, "sort_order": u.sort_order} for u in units]


@app.post("/api/use-units")
def save_use_units(data: List[dict], contract_id: int = Query(1), db: Session = Depends(database.get_db), _: models.User = Depends(require_write)):
    existing = db.query(models.WorkUnit).filter(models.WorkUnit.contract_id == contract_id)
    existing_ids = {u.id for u in existing}
    submitted_ids = {d.get("id") for d in data if d.get("id")}
    for u in existing:
        if u.id not in submitted_ids:
            db.delete(u)
    for d in data:
        if d.get("id") and d["id"] in existing_ids:
            existing.filter(models.WorkUnit.id == d["id"]).update({"name": d["name"], "sort_order": d.get("sort_order", 0)})
        else:
            db.add(models.WorkUnit(contract_id=contract_id, name=d["name"], sort_order=d.get("sort_order", 0)))
    db.commit()
    return {"status": "ok"}


@app.get("/api/installation/unit-allocations")
def get_unit_allocations(contract_id: int = Query(1), db: Session = Depends(database.get_db)):
    allocs = db.query(models.DeviceUnitAllocation).filter(models.DeviceUnitAllocation.contract_id == contract_id).all()
    result = {}
    for a in allocs:
        key = str(a.equipment_item_id)
        if key not in result:
            result[key] = []
        result[key].append({"use_unit": a.use_unit, "allocated_qty": a.allocated_qty})
    return result


@app.post("/api/installation/unit-allocations")
def save_unit_allocations(data: dict, contract_id: int = Query(1), db: Session = Depends(database.get_db), _: models.User = Depends(require_write)):
    item_id = data.get("equipment_item_id")
    allocations = data.get("allocations", [])
    db.query(models.DeviceUnitAllocation).filter(
        models.DeviceUnitAllocation.equipment_item_id == item_id,
        models.DeviceUnitAllocation.contract_id == contract_id
    ).delete()
    for alloc in allocations:
        if alloc.get("allocated_qty", 0) > 0:
            db.add(models.DeviceUnitAllocation(
                contract_id=contract_id,
                equipment_item_id=item_id,
                use_unit=alloc["use_unit"],
                allocated_qty=alloc["allocated_qty"]
            ))
    db.commit()
    return {"status": "ok"}


@app.post("/api/installation/unit-allocations/batch")
def save_unit_allocations_batch(data: List[dict], contract_id: int = Query(1), db: Session = Depends(database.get_db), _: models.User = Depends(require_write)):
    for item_data in data:
        item_id = item_data.get("equipment_item_id")
        allocations = item_data.get("allocations", [])
        db.query(models.DeviceUnitAllocation).filter(
            models.DeviceUnitAllocation.equipment_item_id == item_id,
            models.DeviceUnitAllocation.contract_id == contract_id
        ).delete()
        for alloc in allocations:
            if alloc.get("allocated_qty", 0) > 0:
                db.add(models.DeviceUnitAllocation(
                    contract_id=contract_id,
                    equipment_item_id=item_id,
                    use_unit=alloc["use_unit"],
                    allocated_qty=alloc["allocated_qty"]
                ))
    db.commit()
    return {"status": "ok"}


@app.post("/api/installation/generate-by-unit")
def generate_by_unit(data: dict, contract_id: int = Query(1), period_id: Optional[int] = None, db: Session = Depends(database.get_db), _: models.User = Depends(require_write)):
    item_ids = data.get("item_ids", [])
    if not item_ids:
        raise HTTPException(400, "请选择设备")

    if period_id:
        skipped_ids = set(
            s.equipment_item_id for s in db.query(models.InstallSkip).filter(
                models.InstallSkip.contract_id == contract_id,
                models.InstallSkip.period_id == period_id
            ).all()
        )
        item_ids = [i for i in item_ids if i not in skipped_ids]
    from datetime import date
    count = db.query(models.InstallationRecord).count()
    period = db.query(models.ProgressPeriod).filter(models.ProgressPeriod.id == period_id).first() if period_id else None
    period_label = f"第{period.period_no}期" if period else "全部期次"
    created = []
    for item_id in item_ids:
        item = db.query(models.EquipmentItem).filter(models.EquipmentItem.id == item_id).first()
        if not item:
            continue
        allocations = db.query(models.DeviceUnitAllocation).filter(
            models.DeviceUnitAllocation.equipment_item_id == item_id,
            models.DeviceUnitAllocation.contract_id == contract_id
        ).all()
        if not allocations:
            continue
        for alloc in allocations:
            if alloc.allocated_qty <= 0:
                continue
            count += 1
            record = models.InstallationRecord(
                contract_id=contract_id,
                record_no=f"CX-{count:04d}",
                project_name="CX项目智能工地建设",
                equipment_type="智能工地设备",
                install_unit="中国电信股份有限公司楚雄分公司",
                install_personnel="",
                install_date=date.today(),
                use_unit=alloc.use_unit,
                install_content=f"根据{period_label}进度核定数据按使用单位分配生成",
                install_conclusion="",
                period_id=period_id,
            )
            db.add(record)
            db.flush()
            db.add(models.InstallationRecordItem(
                record_id=record.id,
                equipment_item_id=item.id,
                equipment_name=item.name,
                specification=item.specification or "",
                unit=item.unit or "",
                quantity=round(alloc.allocated_qty, 2),
                location="",
                remark=f"使用单位: {alloc.use_unit}",
            ))
            created.append({"id": record.id, "record_no": record.record_no, "use_unit": alloc.use_unit})
    if not created:
        raise HTTPException(400, "所选设备未分配使用单位，请先分配")
    db.commit()
    return {"records": created, "total": len(created)}


@app.post("/api/installation/generate-by-unit-merged")
def generate_by_unit_merged(data: dict, contract_id: int = Query(1), period_id: Optional[int] = None, db: Session = Depends(database.get_db), _: models.User = Depends(require_write)):
    """按使用单位合并生成安装记录：同一使用单位的所有设备合并为一条记录"""
    item_ids = data.get("item_ids", [])
    if not item_ids:
        raise HTTPException(400, "请选择设备")

    if period_id:
        skipped_ids = set(
            s.equipment_item_id for s in db.query(models.InstallSkip).filter(
                models.InstallSkip.contract_id == contract_id,
                models.InstallSkip.period_id == period_id
            ).all()
        )
        item_ids = [i for i in item_ids if i not in skipped_ids]
    from datetime import date

    all_progress = db.query(models.ProgressEntry)
    if period_id:
        all_progress = all_progress.filter(models.ProgressEntry.period_id == period_id)
    all_progress = all_progress.all()

    progress_by_item = {}
    for pe in all_progress:
        if pe.item_id not in progress_by_item:
            progress_by_item[pe.item_id] = 0.0
        progress_by_item[pe.item_id] += (pe.contractor_current or 0)

    unit_items: dict[str, list] = {}
    for item_id in item_ids:
        item = db.query(models.EquipmentItem).filter(models.EquipmentItem.id == item_id).first()
        if not item:
            continue
        allocations = db.query(models.DeviceUnitAllocation).filter(
            models.DeviceUnitAllocation.equipment_item_id == item_id,
            models.DeviceUnitAllocation.contract_id == contract_id
        ).all()
        if not allocations:
            continue
        needed = progress_by_item.get(item.id, 0)
        already = sum(
            ri.quantity for ri in db.query(models.InstallationRecordItem).filter(
                models.InstallationRecordItem.equipment_item_id == item.id
            ).all()
        )
        remaining = needed - already
        if remaining <= 0:
            continue
        for alloc in allocations:
            if alloc.allocated_qty <= 0:
                continue
            qty = min(alloc.allocated_qty, remaining)
            if qty <= 0:
                continue
            if alloc.use_unit not in unit_items:
                unit_items[alloc.use_unit] = []
            unit_items[alloc.use_unit].append({
                "equipment_item_id": item.id,
                "equipment_name": item.name,
                "specification": item.specification or "",
                "unit": item.unit or "",
                "quantity": round(qty, 2),
                "location": "",
                "remark": f"使用单位: {alloc.use_unit}",
            })

    if not unit_items:
        raise HTTPException(400, "所选设备未分配使用单位，请先分配")

    count = db.query(models.InstallationRecord).count()
    period = db.query(models.ProgressPeriod).filter(models.ProgressPeriod.id == period_id).first() if period_id else None
    period_label = f"第{period.period_no}期" if period else "全部期次"
    created = []

    for use_unit, items in unit_items.items():
        count += 1
        names = ", ".join([it["equipment_name"] for it in items[:3]])
        if len(items) > 3:
            names += f"等{len(items)}项"
        content = f"根据{period_label}进度核定数据按使用单位[{use_unit}]生成" if period_label else f"按使用单位[{use_unit}]生成的安装记录"

        record = models.InstallationRecord(
            contract_id=contract_id,
            record_no=f"CX-{count:04d}",
            project_name="CX项目智能工地建设",
            equipment_type="智能工地设备",
            install_unit="中国电信股份有限公司楚雄分公司",
            install_personnel="",
            install_date=date.today(),
            use_unit=use_unit,
            install_content=content,
            install_conclusion="",
            period_id=period_id,
        )
        db.add(record)
        db.flush()
        for it in items:
            db.add(models.InstallationRecordItem(
                record_id=record.id,
                equipment_item_id=it["equipment_item_id"],
                equipment_name=it["equipment_name"],
                specification=it["specification"],
                unit=it["unit"],
                quantity=it["quantity"],
                location=it["location"],
                remark=it["remark"],
            ))
        created.append({"id": record.id, "record_no": record.record_no, "use_unit": use_unit, "item_count": len(items)})

    db.commit()
    return {"records": created, "total": len(created)}


# ==================== Install Personnel Management ====================
@app.get("/api/install-personnel")
def list_personnel(contract_id: int = Query(1), db: Session = Depends(database.get_db)):
    personnel = db.query(models.InstallPersonnel).filter(
        models.InstallPersonnel.contract_id == contract_id
    ).order_by(models.InstallPersonnel.sort_order).all()
    return [{"id": p.id, "name": p.name, "is_default": p.is_default, "sort_order": p.sort_order} for p in personnel]


@app.post("/api/install-personnel")
def create_personnel(data: dict, contract_id: int = Query(1), db: Session = Depends(database.get_db), _: models.User = Depends(require_write)):
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(400, "人员姓名不能为空")
    existing = db.query(models.InstallPersonnel).filter(
        models.InstallPersonnel.contract_id == contract_id,
        models.InstallPersonnel.name == name
    ).first()
    if existing:
        raise HTTPException(400, f"人员 '{name}' 已存在")
    max_order = db.query(models.InstallPersonnel).filter(
        models.InstallPersonnel.contract_id == contract_id
    ).count()
    p = models.InstallPersonnel(contract_id=contract_id, name=name, is_default=data.get("is_default", False), sort_order=max_order)
    db.add(p)
    db.commit()
    db.refresh(p)
    return {"id": p.id, "name": p.name, "is_default": p.is_default, "sort_order": p.sort_order}


@app.put("/api/install-personnel/{personnel_id}")
def update_personnel(personnel_id: int, data: dict, db: Session = Depends(database.get_db), _: models.User = Depends(require_write)):
    p = db.query(models.InstallPersonnel).filter(models.InstallPersonnel.id == personnel_id).first()
    if not p:
        raise HTTPException(404, "人员不存在")
    if "name" in data and data["name"].strip():
        p.name = data["name"].strip()
    if "is_default" in data:
        p.is_default = data["is_default"]
    if "sort_order" in data:
        p.sort_order = data["sort_order"]
    db.commit()
    db.refresh(p)
    return {"id": p.id, "name": p.name, "is_default": p.is_default, "sort_order": p.sort_order}


@app.delete("/api/install-personnel/{personnel_id}")
def delete_personnel(personnel_id: int, db: Session = Depends(database.get_db), _: models.User = Depends(require_write)):
    p = db.query(models.InstallPersonnel).filter(models.InstallPersonnel.id == personnel_id).first()
    if not p:
        raise HTTPException(404, "人员不存在")
    db.delete(p)
    db.commit()
    return {"status": "ok"}


def _set_cell(cell, text, bold=False, bg=None, align=None, font_size=None):
    """辅助函数：设置表格单元格内容与样式"""
    from docx.shared import Pt, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.oxml.ns import qn
    from docx.oxml import parse_xml
    if font_size is None:
        font_size = Pt(9)
    cell.text = ""
    p = cell.paragraphs[0]
    p.alignment = align if align else WD_ALIGN_PARAGRAPH.LEFT
    run = p.add_run(str(text))
    run.bold = bold
    run.font.size = font_size
    run.font.name = 'SimSun'
    run.element.rPr.rFonts.set(qn('w:eastAsia'), 'SimSun')
    if bg:
        shading = parse_xml(f'<w:shd w:fill="{bg}" w:val="clear" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"/>')
        cell._tc.get_or_add_tcPr().append(shading)


def _build_docx(record):
    """共享函数：构建安装记录Word文档对象"""
    from docx import Document
    from docx.shared import Pt, Cm, Inches, RGBColor, Emu
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
    from docx.oxml.ns import qn
    from docx.oxml import OxmlElement

    doc = Document()

    section = doc.sections[0]
    section.page_width = Cm(21)
    section.page_height = Cm(29.7)
    section.top_margin = Cm(1.5)
    section.bottom_margin = Cm(1.5)
    section.left_margin = Cm(1.5)
    section.right_margin = Cm(1.5)

    style = doc.styles['Normal']
    style.font.name = 'SimSun'
    style.font.size = Pt(10.5)
    style.element.rPr.rFonts.set(qn('w:eastAsia'), 'SimSun')

    install_date_str = str(record.install_date) if record.install_date else ""
    install_sign_date_str = str(record.install_sign_date) if record.install_sign_date else ""
    client_sign_date_str = str(record.client_sign_date) if record.client_sign_date else ""
    period_label = f"第{record.period.period_no}期" if record.period else ""

    table = doc.add_table(rows=1, cols=7, style='Table Grid')
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    def _set_vcenter(cell):
        tcPr = cell._tc.get_or_add_tcPr()
        vAlign = OxmlElement('w:vAlign')
        vAlign.set(qn('w:val'), 'center')
        tcPr.append(vAlign)

    title_row = table.rows[0]
    title_row.cells[0].merge(title_row.cells[6])
    _set_vcenter(title_row.cells[0])
    p = title_row.cells[0].paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = p.add_run('设备安装记录表    ')
    run.bold = True
    run.font.size = Pt(16)
    run.font.name = 'SimSun'
    run.element.rPr.rFonts.set(qn('w:eastAsia'), 'SimSun')
    run = p.add_run(f'编号：{record.record_no or "CX-0001"}')
    run.bold = True
    run.font.size = Pt(9)
    run.font.name = 'SimSun'
    run.element.rPr.rFonts.set(qn('w:eastAsia'), 'SimSun')

    def _add_info_row(label1, value1, label2=None, value2=None, merge2_label=True):
        row = table.add_row()
        for cell in row.cells:
            _set_vcenter(cell)
        if label2:
            row.cells[1].merge(row.cells[2])
            if merge2_label:
                row.cells[3].merge(row.cells[4])
            row.cells[5].merge(row.cells[6])
            _set_cell(row.cells[0], label1, bold=False)
            _set_cell(row.cells[1], value1, align=WD_ALIGN_PARAGRAPH.CENTER)
            _set_cell(row.cells[3], label2, bold=False)
            _set_cell(row.cells[5], value2, align=WD_ALIGN_PARAGRAPH.CENTER)
        else:
            row.cells[1].merge(row.cells[6])
            _set_cell(row.cells[0], label1, bold=False)
            _set_cell(row.cells[1], value1, align=WD_ALIGN_PARAGRAPH.LEFT)
        return row

    _add_info_row("项目名称", record.project_name or "CX项目智能工地建设",
                  "设备类型", record.equipment_type or "智能工地设备")
    _add_info_row("安装单位", record.install_unit or "中国电信股份有限公司楚雄分公司")
    _add_info_row("安装人员", record.install_personnel or "代树平、徐家有、徐家明")
    _add_info_row("安装时间", install_date_str,
                  "使用单位", record.use_unit or "楚雄国储龙慧项目部")

    section_row = table.add_row()
    section_row.cells[0].merge(section_row.cells[6])
    _set_vcenter(section_row.cells[0])
    _set_cell(section_row.cells[0], '安  装  内  容', bold=False, align=WD_ALIGN_PARAGRAPH.CENTER)

    eq_headers = ['序号', '设备名称', '规格型号', '单位', '数量', '安装位置', '备注']
    hdr_row = table.add_row()
    for i, h in enumerate(eq_headers):
        _set_cell(hdr_row.cells[i], h, bold=True, align=WD_ALIGN_PARAGRAPH.CENTER, font_size=Pt(9))

    for idx, item in enumerate(record.items, 1):
        row = table.add_row()
        _set_cell(row.cells[0], str(idx), align=WD_ALIGN_PARAGRAPH.CENTER, font_size=Pt(9))
        _set_cell(row.cells[1], item.equipment_name or "", font_size=Pt(9))
        _set_cell(row.cells[2], item.specification or "", align=WD_ALIGN_PARAGRAPH.CENTER, font_size=Pt(9))
        _set_cell(row.cells[3], item.unit or "", align=WD_ALIGN_PARAGRAPH.CENTER, font_size=Pt(9))
        _set_cell(row.cells[4], str(item.quantity) if item.quantity else "0", align=WD_ALIGN_PARAGRAPH.CENTER, font_size=Pt(9))
        _set_cell(row.cells[5], item.location or "", font_size=Pt(9))
        _set_cell(row.cells[6], item.remark or "", font_size=Pt(9))

    section_row2 = table.add_row()
    section_row2.cells[0].merge(section_row2.cells[6])
    _set_vcenter(section_row2.cells[0])
    _set_cell(section_row2.cells[0], '安   装   结   论', bold=False, align=WD_ALIGN_PARAGRAPH.CENTER)

    conclusion_row = table.add_row()
    conclusion_row.cells[0].merge(conclusion_row.cells[6])
    _set_vcenter(conclusion_row.cells[0])
    default_conclusion = "设备安装到位，接线规范，调试正常，各项指标符合设计及规范要求，运行稳定。"
    _set_cell(conclusion_row.cells[0], record.install_conclusion or default_conclusion, align=WD_ALIGN_PARAGRAPH.LEFT)
    trPr = conclusion_row._tr.get_or_add_trPr()
    trHeight = OxmlElement('w:trHeight')
    trHeight.set(qn('w:val'), '600')
    trHeight.set(qn('w:hRule'), 'atLeast')
    trPr.append(trHeight)

    sign_row = table.add_row()
    sign_row.cells[0].merge(sign_row.cells[3])
    sign_row.cells[4].merge(sign_row.cells[6])
    for cell in sign_row.cells:
        _set_vcenter(cell)
    sign_left = f"安装单位：{record.install_unit or ''}\n\n负责人（签字）：{record.install_signatory or ''}\n\n日期：{install_sign_date_str}"
    sign_right = f"委托单位：\n\n负责人（签字）：{record.client_signatory or ''}\n\n日期：{client_sign_date_str}"
    p = sign_row.cells[0].paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    run = p.add_run(sign_left)
    run.font.name = 'SimSun'
    run.element.rPr.rFonts.set(qn('w:eastAsia'), 'SimSun')
    p = sign_row.cells[4].paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    run = p.add_run(sign_right)
    run.font.name = 'SimSun'
    run.element.rPr.rFonts.set(qn('w:eastAsia'), 'SimSun')
    trPr = sign_row._tr.get_or_add_trPr()
    trHeight = OxmlElement('w:trHeight')
    trHeight.set(qn('w:val'), '2000')
    trHeight.set(qn('w:hRule'), 'atLeast')
    trPr.append(trHeight)

    doc.add_page_break()

    all_images = []
    if record.images:
        all_images.extend([img.strip() for img in record.images.split(",") if img.strip()])
    for item in record.items:
        if item.images:
            all_images.extend([img.strip() for img in item.images.split(",") if img.strip()])

    if all_images:
        doc.add_paragraph()
        p = doc.add_paragraph()
        run = p.add_run('安装现场图片：')
        run.bold = True
        run.font.size = Pt(11)

        img_table = doc.add_table(rows=1, cols=2, style='Table Grid')
        img_table.alignment = WD_TABLE_ALIGNMENT.CENTER
        for row in img_table.rows:
            row.cells[0].width = Cm(2)
            row.cells[1].width = Cm(16)

        row = img_table.rows[0]
        _set_cell(row.cells[0], "序号", bold=True, bg="D9E8F7", align=WD_ALIGN_PARAGRAPH.CENTER)
        _set_cell(row.cells[1], "安装图片", bold=True, bg="D9E8F7", align=WD_ALIGN_PARAGRAPH.CENTER)

        for idx, img_name in enumerate(all_images, 1):
            img_path = os.path.join(UPLOAD_DIR, img_name)
            row = img_table.add_row()
            _set_cell(row.cells[0], str(idx), align=WD_ALIGN_PARAGRAPH.CENTER)
            if os.path.exists(img_path):
                try:
                    p = row.cells[1].paragraphs[0]
                    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                    run = p.add_run()
                    run.add_picture(img_path, width=Cm(14))
                except Exception:
                    _set_cell(row.cells[1], f"[图片: {img_name}]")
            else:
                _set_cell(row.cells[1], f"[图片未找到: {img_name}]")

    doc.add_paragraph()
    footer = doc.add_paragraph()
    footer.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    run = footer.add_run(f'编制日期: {install_date_str}')
    run.font.size = Pt(9)

    return doc


@app.get("/api/installation/export-word/{record_id}")
def export_word(record_id: int, db: Session = Depends(database.get_db)):
    """按模板导出安装记录为Word文档，包含安装图片"""
    from fastapi.responses import Response
    from io import BytesIO
    from urllib.parse import quote

    record = db.query(models.InstallationRecord).filter(
        models.InstallationRecord.id == record_id
    ).first()
    if not record:
        raise HTTPException(404, "记录不存在")

    try:
        doc = _build_docx(record)
    except ImportError:
        raise HTTPException(500, "请安装 python-docx: pip install python-docx")

    buf = BytesIO()
    doc.save(buf)
    buf.seek(0)
    filename = f"安装记录_{record.record_no}.docx"
    encoded_filename = quote(filename)
    return Response(
        content=buf.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"}
    )


@app.get("/api/installation/export-pdf/{record_id}")
def export_pdf(record_id: int, db: Session = Depends(database.get_db)):
    """导出安装记录为PDF文档（生成Word后转PDF），包含安装图片"""
    from fastapi.responses import Response
    from urllib.parse import quote

    record = db.query(models.InstallationRecord).filter(
        models.InstallationRecord.id == record_id
    ).first()
    if not record:
        raise HTTPException(404, "记录不存在")

    try:
        doc = _build_docx(record)
    except ImportError:
        raise HTTPException(500, "请安装 python-docx: pip install python-docx")

    try:
        from docx2pdf import convert
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix='.docx') as tmp:
            doc.save(tmp.name)
            pdf_path = tmp.name.replace('.docx', '.pdf')
        convert(tmp.name, pdf_path)
        with open(pdf_path, 'rb') as f:
            pdf_data = f.read()
        os.unlink(tmp.name)
        os.unlink(pdf_path)
    except ImportError:
        raise HTTPException(500, "请安装 docx2pdf: pip install docx2pdf")
    except Exception as e:
        from io import BytesIO
        buf = BytesIO()
        doc.save(buf)
        buf.seek(0)
        raise HTTPException(500, f"PDF转换失败（需安装Word或LibreOffice），请先下载Word文档: {str(e)}")

    filename = f"安装记录_{record.record_no}.pdf"
    encoded = quote(filename)
    return Response(
        content=pdf_data,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded}"}
    )


@app.post("/api/installation/export-word/batch")
def export_word_batch(data: dict, db: Session = Depends(database.get_db), _: models.User = Depends(require_write)):
    import zipfile
    from io import BytesIO
    from urllib.parse import quote

    ids = data.get("ids", [])
    if not ids:
        raise HTTPException(400, "请提供要导出的记录ID列表")

    records = db.query(models.InstallationRecord).filter(
        models.InstallationRecord.id.in_(ids)
    ).all()
    if not records:
        raise HTTPException(404, "未找到匹配的记录")

    zip_buf = BytesIO()
    with zipfile.ZipFile(zip_buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for record in records:
            doc = _build_docx(record)
            buf = BytesIO()
            doc.save(buf)
            buf.seek(0)
            filename = f"安装记录_{record.record_no}.docx"
            zf.writestr(filename, buf.getvalue())

    zip_buf.seek(0)
    safe_name = quote(f"安装记录_批量导出_{len(records)}份.zip")
    return Response(
        content=zip_buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{safe_name}"}
    )


@app.post("/api/installation/export-pdf/batch")
def export_pdf_batch(data: dict, db: Session = Depends(database.get_db), _: models.User = Depends(require_write)):
    import zipfile
    import tempfile
    from io import BytesIO
    from urllib.parse import quote

    ids = data.get("ids", [])
    if not ids:
        raise HTTPException(400, "请提供要导出的记录ID列表")

    records = db.query(models.InstallationRecord).filter(
        models.InstallationRecord.id.in_(ids)
    ).all()
    if not records:
        raise HTTPException(404, "未找到匹配的记录")

    zip_buf = BytesIO()
    with zipfile.ZipFile(zip_buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for record in records:
            doc = _build_docx(record)
            with tempfile.NamedTemporaryFile(delete=False, suffix='.docx') as tmp:
                doc.save(tmp.name)
                pdf_path = tmp.name.replace('.docx', '.pdf')
            try:
                from docx2pdf import convert
                convert(tmp.name, pdf_path)
                with open(pdf_path, 'rb') as f:
                    pdf_data = f.read()
                filename = f"安装记录_{record.record_no}.pdf"
                zf.writestr(filename, pdf_data)
            except ImportError:
                raise HTTPException(500, "请安装 docx2pdf: pip install docx2pdf")
            except Exception as e:
                filename = f"安装记录_{record.record_no}.pdf"
                zf.writestr(f"{filename}.error.txt", f"转换失败: {str(e)}")
            finally:
                if os.path.exists(tmp.name):
                    os.unlink(tmp.name)
                if os.path.exists(pdf_path):
                    os.unlink(pdf_path)

    zip_buf.seek(0)
    safe_name = quote(f"安装记录_批量导出_{len(records)}份_PDF.zip")
    return Response(
        content=zip_buf.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{safe_name}"}
    )


# ==================== Installation: Image Upload ====================
@app.post("/api/installation/upload-image/{record_id}")
def upload_installation_image(
    record_id: int,
    file: UploadFile = File(...),
    item_id: Optional[int] = None,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_write)
):
    record = db.query(models.InstallationRecord).filter(
        models.InstallationRecord.id == record_id
    ).first()
    if not record:
        raise HTTPException(404, "记录不存在")

    ext = os.path.splitext(file.filename)[1] or ".jpg"
    safe_name = f"install_{record_id}"
    if item_id:
        safe_name += f"_item_{item_id}"
    safe_name += f"_{os.urandom(4).hex()}{ext}"
    file_path = os.path.join(UPLOAD_DIR, safe_name)

    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    if item_id:
        item = db.query(models.InstallationRecordItem).filter(
            models.InstallationRecordItem.id == item_id,
            models.InstallationRecordItem.record_id == record_id
        ).first()
        if item:
            existing = item.images or ""
            item.images = (existing + "," + safe_name).strip(",")
    else:
        existing = record.images or ""
        record.images = (existing + "," + safe_name).strip(",")

    db.commit()
    return {"filename": safe_name, "url": f"/uploads/{safe_name}"}


@app.delete("/api/installation/image/{record_id}/{filename}")
def delete_installation_image(
    record_id: int,
    filename: str,
    item_id: Optional[int] = None,
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_write)
):
    record = db.query(models.InstallationRecord).filter(
        models.InstallationRecord.id == record_id
    ).first()
    if not record:
        raise HTTPException(404, "记录不存在")

    if item_id:
        item = db.query(models.InstallationRecordItem).filter(
            models.InstallationRecordItem.id == item_id,
            models.InstallationRecordItem.record_id == record_id
        ).first()
        if item and item.images:
            imgs = [s.strip() for s in item.images.split(",") if s.strip()]
            item.images = ",".join([s for s in imgs if s != filename])
    else:
        if record.images:
            imgs = [s.strip() for s in record.images.split(",") if s.strip()]
            record.images = ",".join([s for s in imgs if s != filename])

    file_path = os.path.join(UPLOAD_DIR, filename)
    if os.path.exists(file_path):
        os.remove(file_path)

    db.commit()
    return {"status": "ok"}


# ==================== Settlement ====================
@app.get("/api/settlement/summary")
def settlement_summary(contract_id: int = Query(1), db: Session = Depends(database.get_db)):
    contract = db.query(models.Contract).filter(models.Contract.id == contract_id).first()
    if not contract:
        return {"contract_amount": 0, "total_settlement": 0, "total_paid": 0,
                "total_penalty": 0, "unpaid": 0, "completion_rate": 0}
    
    contract_amt = contract.contract_amount or 0
    
    items = db.query(models.EquipmentItem).filter(
        models.EquipmentItem.contract_id == contract_id
    ).all()
    
    total_settlement_tax = 0.0
    total_paid = 0.0
    total_actual_paid = 0.0
    category_settlements = {}
    
    for item in items:
        cat = item.category
        cat_name = cat.name if cat else "未分类"
        tax_rate = cat.tax_rate if cat else 0.13
        for entry in item.progress_entries:
            total_settlement_tax += (entry.settlement_amount or 0)
            total_paid += (entry.payment_amount or 0)
            total_actual_paid += (entry.actual_paid_amount or 0)
            key = (cat_name, tax_rate)
            category_settlements[key] = category_settlements.get(key, 0) + (entry.settlement_amount or 0)
    
    # Calculate tax-free settlement: ROUND(SUM(category_6%/1.06 + category_13%/1.13), 2)
    total_settlement_no_tax = 0.0
    for (cat_name, tax_rate), amount in category_settlements.items():
        total_settlement_no_tax += amount / (1 + tax_rate)
    total_settlement_no_tax = round(total_settlement_no_tax, 2)
    
    tax_amount = round(total_settlement_tax - total_settlement_no_tax, 2)
    
    # Warranty: 10% of settlement (no tax)
    warranty_rate = 0.10
    deduction_warranty = round(total_settlement_no_tax * warranty_rate, 2)
    
    # Prepayment deduction
    deduction_prepayment = contract.prepayment or 0
    
    # Actual payment
    payment_amount = round(total_settlement_no_tax - deduction_prepayment - deduction_warranty, 2)
    
    # Payment ratio
    payment_ratio = round(payment_amount / contract_amt, 4) if contract_amt else 0
    
    penalties = db.query(models.Penalty).filter(
        models.Penalty.contract_id == contract_id
    ).all()
    total_penalty = sum(p.total_penalty or 0 for p in penalties)
    
    return {
        "contract_amount": contract_amt,
        "total_settlement": total_settlement_no_tax,
        "total_settlement_tax": total_settlement_tax,
        "tax_amount": tax_amount,
        "total_paid": round(total_paid, 2),
        "total_actual_paid": round(total_actual_paid, 2),
        "total_penalty": round(total_penalty, 2),
        "deduction_warranty": deduction_warranty,
        "deduction_prepayment": deduction_prepayment,
        "payment_amount": payment_amount,
        "payment_ratio": payment_ratio,
        "warranty_rate": warranty_rate,
        "unpaid": round(total_settlement_no_tax - total_actual_paid, 2),
        "completion_rate": round(total_settlement_tax / contract_amt * 100, 2) if contract_amt else 0
    }


@app.get("/api/settlement/detail")
def settlement_detail(period_id: Optional[int] = None, contract_id: int = Query(1), db: Session = Depends(database.get_db)):
    items = db.query(models.EquipmentItem).filter(
        models.EquipmentItem.contract_id == contract_id
    ).order_by(models.EquipmentItem.id).all()
    result = []
    for item in items:
        cat = item.category
        tax_rate = cat.tax_rate if cat else 0.13
        cat_name = cat.name if cat else "未分类"
        
        total_settled_tax = 0.0
        total_paid_amount = 0.0
        total_actual_paid_amount = 0.0
        latest_dept_cum = 0.0
        entries = sorted(item.progress_entries, key=lambda e: e.period.period_no if e.period else 0)
        for entry in entries:
            if period_id and entry.period_id != period_id:
                continue
            total_settled_tax += (entry.settlement_amount or 0)
            total_paid_amount += (entry.payment_amount or 0)
            total_actual_paid_amount += (entry.actual_paid_amount or 0)
            latest_dept_cum = entry.dept_total_cumulative or 0
        
        # Auto-calculate: settlement = qty × unit_price (if not manually set)
        settled_no_tax = round(total_settled_tax / (1 + tax_rate), 2)
        paid_no_tax = round(total_paid_amount / (1 + tax_rate), 2)
        actual_paid_no_tax = round(total_actual_paid_amount / (1 + tax_rate), 2)
        
        result.append({
            "item_id": item.id,
            "item_name": item.name,
            "specification": item.specification or "",
            "unit": item.unit or "",
            "contract_quantity": item.contract_quantity,
            "unit_price": item.unit_price,
            "contract_amount": item.contract_amount,
            "category_name": cat_name,
            "tax_rate": tax_rate,
            "dept_verified_cumulative": latest_dept_cum,
            "total_settlement_tax": total_settled_tax,
            "total_settlement": settled_no_tax,
            "total_paid": paid_no_tax,
            "actual_paid": actual_paid_no_tax,
            "unpaid": round(settled_no_tax - actual_paid_no_tax, 2),
            "completion_rate": round(latest_dept_cum / item.contract_quantity * 100, 2) if item.contract_quantity else 0
        })
    return result


@app.put("/api/settlement/actual-paid/batch")
def batch_update_actual_paid(
    entries: List[schemas.ProgressEntryIn],
    period_id: int = Query(None),
    contract_id: int = Query(1),
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_write)
):
    for data in entries:
        q = db.query(models.ProgressEntry).filter(
            models.ProgressEntry.item_id == data.item_id
        )
        if period_id:
            q = q.filter(models.ProgressEntry.period_id == period_id)
        existing = q.first()
        if existing:
            existing.actual_paid_amount = data.actual_paid_amount
    db.commit()
    return {"status": "ok"}


# ==================== Penalties ====================
@app.get("/api/penalties")
def list_penalties(contract_id: int = Query(1), db: Session = Depends(database.get_db)):
    return db.query(models.Penalty).filter(
        models.Penalty.contract_id == contract_id
    ).all()


@app.post("/api/penalties")
def create_penalty(data: dict, contract_id: int = Query(1), db: Session = Depends(database.get_db), _: models.User = Depends(require_write)):
    p = models.Penalty(contract_id=contract_id, **data)
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


# ==================== Import ====================
@app.post("/api/import/from-excel")
def import_from_excel(db: Session = Depends(database.get_db), _: models.User = Depends(require_write)):
    import import_data
    import_data.import_all(db)
    return {"status": "ok"}


@app.post("/api/import/upload")
async def import_upload(
    contract_id: int = Query(1),
    file: UploadFile = File(...),
    db: Session = Depends(database.get_db),
    _: models.User = Depends(require_write)
):
    """上传Excel文件导入设备清单到指定合同"""
    import import_data
    file_bytes = await file.read()
    result = import_data.import_to_contract(file_bytes, contract_id, db)
    return {"status": "ok", **result}


# ==================== 安装设备确认单导出 ====================
@app.get("/api/export/confirmation-sheet")
def export_confirmation_sheet(
    contract_id: int = Query(...),
    use_unit: str = Query(...),
    document_no: str = Query(default=""),
    db: Session = Depends(database.get_db)
):
    """生成安装设备确认单Excel（按使用单位）"""
    import io, openpyxl
    from openpyxl.styles import Font, Alignment, Border, Side, PatternFill

    contract = db.query(models.Contract).filter(models.Contract.id == contract_id).first()
    if not contract:
        raise HTTPException(404, "合同不存在")

    categories = db.query(models.EquipmentCategory).filter(
        models.EquipmentCategory.contract_id == contract_id
    ).order_by(models.EquipmentCategory.sort_order).all()

    all_items = db.query(models.EquipmentItem).filter(
        models.EquipmentItem.contract_id == contract_id
    ).order_by(models.EquipmentItem.id).all()

    allocations = db.query(models.DeviceUnitAllocation).filter(
        models.DeviceUnitAllocation.contract_id == contract_id
    ).all()
    alloc_map = {}
    for a in allocations:
        alloc_map.setdefault(a.equipment_item_id, {})
        alloc_map[a.equipment_item_id][a.use_unit] = a.allocated_qty

    records = db.query(models.InstallationRecord).filter(
        models.InstallationRecord.contract_id == contract_id,
        models.InstallationRecord.use_unit == use_unit
    ).all()
    installed_items = set()
    install_dates = {}
    install_locations = {}
    for rec in records:
        for ri in rec.items:
            if ri.equipment_item_id:
                installed_items.add(ri.equipment_item_id)
                install_dates[ri.equipment_item_id] = rec.install_date
                install_locations[ri.equipment_item_id] = ri.location or ""

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = f"确认单-{use_unit}"

    thin_border = Border(
        left=Side(style='thin'), right=Side(style='thin'),
        top=Side(style='thin'), bottom=Side(style='thin')
    )
    center_align = Alignment(horizontal='center', vertical='center', wrap_text=True)
    left_align = Alignment(horizontal='left', vertical='center', wrap_text=True)
    header_font = Font(name='SimSun', bold=True, size=10)
    body_font = Font(name='SimSun', size=9)
    title_font = Font(name='SimSun', bold=True, size=14)
    section_font = Font(name='SimSun', bold=True, size=10)
    gray_fill = PatternFill('solid', fgColor='D9D9D9')

    col_widths = {'A': 6, 'B': 22, 'C': 10, 'D': 16, 'E': 6, 'F': 8, 'G': 14, 'H': 14, 'I': 18, 'J': 30}
    for c, w in col_widths.items():
        ws.column_dimensions[c].width = w

    # Title row
    ws.merge_cells('A1:J1')
    cell = ws['A1']
    no_str = f"  编号：{document_no}" if document_no else ""
    cell.value = f"CX项目智能工地硬件安装确认单-{use_unit}{no_str}"
    cell.font = title_font
    cell.alignment = center_align
    ws.row_dimensions[1].height = 30

    # Header row
    headers = ['序号', '设备名称', '品牌', '规格型号', '单位', '数量', '安装情况', '安装时间', '使用单位', '安装位置']
    for i, h in enumerate(headers, 1):
        cell = ws.cell(row=2, column=i, value=h)
        cell.font = header_font
        cell.alignment = center_align
        cell.border = thin_border
        cell.fill = gray_fill
    ws.row_dimensions[2].height = 22

    row = 3
    item_idx = 0
    for cat in categories:
        cat_items = [it for it in all_items if it.category_id == cat.id and it.name]
        if not cat_items:
            continue
        # Section header
        ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=10)
        cell = ws.cell(row=row, column=1, value=cat.name)
        cell.font = section_font
        cell.alignment = left_align
        cell.fill = gray_fill
        for c in range(1, 11):
            ws.cell(row=row, column=c).border = thin_border
        ws.row_dimensions[row].height = 22
        row += 1

        for it in cat_items:
            item_idx += 1
            # Use unit string
            alloc_units = alloc_map.get(it.id, {})
            if alloc_units:
                # Show allocated units
                unit_list = [f"{u}" for u in sorted(alloc_units.keys())]
                unit_str = "、".join(unit_list)
            else:
                unit_str = ""

            installed = it.id in installed_items
            status_str = "þ完成  o未完成" if installed else "o完成  o未完成"
            date_val = install_dates.get(it.id)
            date_str = date_val.strftime('%Y-%m-%d') if date_val else ""

            values = [
                it.seq_no or item_idx,
                it.name,
                it.brand or "",
                it.specification or "",
                it.unit or "",
                it.contract_quantity,
                status_str,
                date_str,
                unit_str,
                install_locations.get(it.id, "")
            ]
            for i, v in enumerate(values, 1):
                cell = ws.cell(row=row, column=i, value=v)
                cell.font = body_font
                cell.border = thin_border
                cell.alignment = center_align if i in (1, 5, 6, 7, 8) else left_align
            ws.row_dimensions[row].height = max(20, 15 * max(1, str(install_locations.get(it.id, "")).count('\n') + 1))
            row += 1

    # Signature area
    row += 1
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=7)
    ws.merge_cells(start_row=row, start_column=8, end_row=row, end_column=10)
    sign_left = f"安装单位：{contract.party_b or ''}\n\n负责人（签字）：\n\n日  期：      年    月    日"
    sign_right = f"委托单位：\n\n负责人（签字）：\n\n日  期：      年    月    日"
    cell_l = ws.cell(row=row, column=1, value=sign_left)
    cell_l.font = body_font
    cell_l.alignment = Alignment(horizontal='left', vertical='top', wrap_text=True)
    cell_l.border = thin_border
    cell_r = ws.cell(row=row, column=8, value=sign_right)
    cell_r.font = body_font
    cell_r.alignment = Alignment(horizontal='left', vertical='top', wrap_text=True)
    cell_r.border = thin_border
    for c in range(1, 11):
        ws.cell(row=row, column=c).border = thin_border
    ws.row_dimensions[row].height = 120

    row += 1
    ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=10)
    cell = ws.cell(row=row, column=1, value="注：本表一式肆份，委托单位留存叁份、安装单位留存一份")
    cell.font = Font(name='SimSun', size=8)
    cell.alignment = Alignment(horizontal='left', vertical='center')

    # Page setup
    ws.page_setup.fitToPage = True
    ws.page_setup.orientation = 'landscape'
    ws.page_setup.paperSize = ws.PAPERSIZE_A3
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_view.showGridLines = False

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    filename = f"安装设备确认单-{use_unit}-{datetime.now().strftime('%Y%m%d')}.xlsx"
    from urllib.parse import quote
    encoded_filename = quote(filename, safe='')
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"}
    )


# ==================== 工程量核对表导出 ====================
@app.get("/api/export/quantity-verification")
def export_quantity_verification(
    period_id: int = Query(...),
    db: Session = Depends(database.get_db)
):
    """导出工程量核对表Excel（按期次）"""
    import io, openpyxl
    from openpyxl.styles import Font, Alignment, Border, Side, PatternFill

    period = db.query(models.ProgressPeriod).filter(models.ProgressPeriod.id == period_id).first()
    if not period:
        raise HTTPException(404, "期次不存在")

    contract = db.query(models.Contract).filter(models.Contract.id == period.contract_id).first()
    if not contract:
        raise HTTPException(404, "合同不存在")

    categories = db.query(models.EquipmentCategory).filter(
        models.EquipmentCategory.contract_id == period.contract_id
    ).order_by(models.EquipmentCategory.sort_order).all()

    all_items = db.query(models.EquipmentItem).filter(
        models.EquipmentItem.contract_id == period.contract_id
    ).order_by(models.EquipmentItem.id).all()

    entries = db.query(models.ProgressEntry).filter(
        models.ProgressEntry.period_id == period_id
    ).all()
    entry_map = {e.item_id: e for e in entries}

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = f"核对表-第{period.period_no}期"

    thin_border = Border(
        left=Side(style='thin'), right=Side(style='thin'),
        top=Side(style='thin'), bottom=Side(style='thin')
    )
    center_align = Alignment(horizontal='center', vertical='center', wrap_text=True)
    left_align = Alignment(horizontal='left', vertical='center', wrap_text=True)
    header_font = Font(name='SimSun', bold=True, size=9)
    body_font = Font(name='SimSun', size=9)
    title_font = Font(name='SimSun', bold=True, size=14)
    section_font = Font(name='SimSun', bold=True, size=10)
    gray_fill = PatternFill('solid', fgColor='D9D9D9')

    col_count = 13
    col_widths = {'A': 6, 'B': 22, 'C': 10, 'D': 14, 'E': 6, 'F': 10, 'G': 14, 'H': 12, 'I': 14, 'J': 14, 'K': 12, 'L': 14, 'M': 20}
    for c, w in col_widths.items():
        ws.column_dimensions[c].width = w

    # Title row
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=col_count)
    cell = ws.cell(row=1, column=1, value=f"工程量核对表 —— 第{period.period_no}期（{period.start_date} ~ {period.end_date}）")
    cell.font = title_font
    cell.alignment = center_align
    ws.row_dimensions[1].height = 30

    # Header rows (2 rows: merged category + sub-columns)
    # Row 2: category headers
    merge_groups = [(2, 2, 'A'), (2, 2, 'B'), (2, 2, 'C'), (2, 2, 'D'), (2, 2, 'E'), (2, 2, 'F'),
                    (7, 9, 'G'), (10, 12, 'J'), (2, 2, 'M')]
    for start_col, end_col, col_letter in merge_groups:
        if start_col != end_col:
            ws.merge_cells(start_row=2, start_column=start_col, end_row=2, end_column=end_col)
        col_idx = start_col
        cell = ws.cell(row=2, column=col_idx)
        cell.font = header_font
        cell.alignment = center_align
        cell.border = thin_border
        cell.fill = gray_fill

    ws.cell(row=2, column=1).value = '序号'
    ws.cell(row=2, column=2).value = '名称'
    ws.cell(row=2, column=3).value = '品牌'
    ws.cell(row=2, column=4).value = '规格型号'
    ws.cell(row=2, column=5).value = '单位'
    ws.cell(row=2, column=6).value = '合同数量'
    ws.cell(row=2, column=7).value = '施工方（承包商）'
    ws.cell(row=2, column=10).value = '监理方（业主）'
    ws.cell(row=2, column=13).value = '备注'

    # Row 3: sub-headers
    sub_headers = ['', '', '', '', '', '',
                   '至上期累计', '本期完成', '至本期累计',
                   '至上期累计', '本期完成', '至本期累计', '']
    for i, h in enumerate(sub_headers, 1):
        cell = ws.cell(row=3, column=i, value=h)
        cell.font = header_font
        cell.alignment = center_align
        cell.border = thin_border
        cell.fill = gray_fill
    ws.row_dimensions[2].height = 22
    ws.row_dimensions[3].height = 22

    row = 4
    item_idx = 0
    for cat in categories:
        cat_items = [it for it in all_items if it.category_id == cat.id and it.name]
        if not cat_items:
            continue
        # Section header
        ws.merge_cells(start_row=row, start_column=1, end_row=row, end_column=col_count)
        cell = ws.cell(row=row, column=1, value=cat.name)
        cell.font = section_font
        cell.alignment = left_align
        cell.fill = gray_fill
        for c in range(1, col_count + 1):
            ws.cell(row=row, column=c).border = thin_border
        ws.row_dimensions[row].height = 22
        row += 1

        for it in cat_items:
            item_idx += 1
            entry = entry_map.get(it.id)
            values = [
                it.seq_no or item_idx,
                it.name,
                it.brand or "",
                it.specification or "",
                it.unit or "",
                it.contract_quantity or 0,
                entry.contractor_prev_cumulative if entry else 0,
                entry.contractor_current if entry else 0,
                entry.contractor_total_cumulative if entry else 0,
                entry.dept_prev_cumulative if entry else 0,
                entry.dept_current if entry else 0,
                entry.dept_total_cumulative if entry else 0,
                it.remark or ""
            ]
            for i, v in enumerate(values, 1):
                cell = ws.cell(row=row, column=i, value=v)
                cell.font = body_font
                cell.border = thin_border
                cell.alignment = center_align if i in (1, 5, 6) or (7 <= i <= 12) else left_align
            ws.row_dimensions[row].height = 20
            row += 1

    # Page setup
    ws.page_setup.fitToPage = True
    ws.page_setup.orientation = 'landscape'
    ws.page_setup.paperSize = ws.PAPERSIZE_A3
    ws.page_setup.fitToWidth = 1
    ws.page_setup.fitToHeight = 0
    ws.sheet_view.showGridLines = False

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)
    filename = f"工程量核对表-第{period.period_no}期-{datetime.now().strftime('%Y%m%d')}.xlsx"
    from urllib.parse import quote
    encoded_filename = quote(filename, safe='')
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"}
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)