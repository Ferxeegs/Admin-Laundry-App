"""
Reports and statistics endpoints.
"""
from typing import Optional
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from app.api.deps import get_db, get_current_active_user
from app.models.order import Order, OrderAddon
from app.models.auth import User
from app.utils.helpers import get_now_local, get_start_of_day_local
from app.schemas.common import WebResponse

router = APIRouter()


@router.get("/operational", response_model=WebResponse[dict])
def get_operational_report(
    period: Optional[str] = Query("daily", regex="^(daily|weekly|monthly)$"),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    # current_user: User = Depends(get_current_active_user),
):
    """
    Get operational report with transaction counts and revenue summary.
    
    Parameters:
    - period: daily, weekly, or monthly
    - start_date: Optional start date (YYYY-MM-DD format)
    - end_date: Optional end date (YYYY-MM-DD format)
    """
    try:
        # Parse dates if provided
        start_dt = None
        end_dt = None
        
        if start_date:
            try:
                # Use local start of day helper
                dt = datetime.strptime(start_date, "%Y-%m-%d")
                start_dt = get_start_of_day_local(dt)
            except ValueError:
                pass
        
        if end_date:
            try:
                # Use local end of day logic (based on start of day + 23:59:59)
                dt = datetime.strptime(end_date, "%Y-%m-%d")
                end_dt = get_start_of_day_local(dt).replace(
                    hour=23, minute=59, second=59
                )
            except ValueError:
                pass
        
        # If no dates provided, use default based on period
        if not start_dt or not end_dt:
            end_dt = get_now_local()
            if period == "daily":
                start_dt = get_start_of_day_local(end_dt)
            elif period == "weekly":
                # Start of week (Monday) in local time
                days_since_monday = end_dt.weekday()
                start_dt = get_start_of_day_local(end_dt - timedelta(days=days_since_monday))
            else:  # monthly
                start_dt = get_start_of_day_local(end_dt.replace(day=1))
        
        # Base query with date filter
        base_query = db.query(Order).filter(
            Order.created_at >= start_dt,
            Order.created_at <= end_dt
        )
        
        # Total transactions
        total_transactions = base_query.count()
        
        # Paid: item fee (paid_items + additional_fee) atau ada layanan tambahan (addon)
        has_addon = (
            db.query(OrderAddon.id)
            .filter(OrderAddon.order_id == Order.id)
            .correlate(Order)
            .exists()
        )
        paid_transactions = base_query.filter(
            or_(
                (Order.paid_items_count > 0) & (Order.additional_fee > 0),
                has_addon,
            )
        ).count()
        
        # Free transactions: all transactions that are NOT paid transactions
        # This includes:
        # - paid_items_count == 0 (no paid items)
        # - additional_fee == 0 (no fee, even if paid_items_count > 0)
        # - both conditions (completely free)
        # This ensures transactions with value 0 are always counted as free
        free_transactions = total_transactions - paid_transactions
        
        # Total revenue: biaya item berbayar + subtotal addon
        item_revenue_result = base_query.with_entities(
            func.coalesce(func.sum(Order.additional_fee), 0)
        ).scalar()
        addon_revenue_result = (
            db.query(func.coalesce(func.sum(OrderAddon.price * OrderAddon.count), 0))
            .select_from(OrderAddon)
            .join(Order, Order.id == OrderAddon.order_id)
            .filter(Order.created_at >= start_dt, Order.created_at <= end_dt)
            .scalar()
        )
        total_revenue = float(item_revenue_result or 0) + float(addon_revenue_result or 0)
        
        # Transaction breakdown by period
        transaction_breakdown = []
        
        # Indonesian month names
        month_names = ["", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", 
                      "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
        
        if period == "daily":
            # Group by day
            daily_stats = (
                base_query.with_entities(
                    func.date(Order.created_at).label("date"),
                    func.count(Order.id).label("count"),
                    func.sum(Order.additional_fee).label("revenue")
                )
                .group_by(func.date(Order.created_at))
                .order_by(func.date(Order.created_at))
                .all()
            )
            
            # Fill in missing days
            current_date = start_dt.date()
            end_date_obj = end_dt.date()
            date_dict = {
                str(stat.date): {"count": stat.count, "revenue": float(stat.revenue or 0)}
                for stat in daily_stats
            }
            daily_addon_stats = (
                db.query(
                    func.date(Order.created_at).label("date"),
                    func.coalesce(func.sum(OrderAddon.price * OrderAddon.count), 0).label("rev"),
                )
                .select_from(OrderAddon)
                .join(Order, Order.id == OrderAddon.order_id)
                .filter(Order.created_at >= start_dt, Order.created_at <= end_dt)
                .group_by(func.date(Order.created_at))
                .all()
            )
            for stat in daily_addon_stats:
                ds = str(stat.date)
                if ds not in date_dict:
                    date_dict[ds] = {"count": 0, "revenue": 0.0}
                date_dict[ds]["revenue"] += float(stat.rev or 0)
            
            while current_date <= end_date_obj:
                date_str = str(current_date)
                month_name = month_names[current_date.month]
                transaction_breakdown.append({
                    "period": date_str,
                    "label": f"{current_date.day} {month_name}",
                    "count": date_dict.get(date_str, {}).get("count", 0),
                    "revenue": date_dict.get(date_str, {}).get("revenue", 0.0)
                })
                current_date += timedelta(days=1)
        
        elif period == "weekly":
            # Group by week - use date_trunc for PostgreSQL
            weekly_stats = (
                base_query.with_entities(
                    func.date_trunc("week", Order.created_at).label("week_start"),
                    func.count(Order.id).label("count"),
                    func.sum(Order.additional_fee).label("revenue")
                )
                .group_by(func.date_trunc("week", Order.created_at))
                .order_by(func.date_trunc("week", Order.created_at))
                .all()
            )
            
            # Generate all weeks in range
            current_week_start = start_dt - timedelta(days=start_dt.weekday())
            end_week_start = end_dt - timedelta(days=end_dt.weekday())
            
            # Create dictionary from stats
            stats_dict = {}
            for stat in weekly_stats:
                if stat.week_start:
                    if isinstance(stat.week_start, datetime):
                        week_key = str(stat.week_start.date())
                    else:
                        week_key = str(stat.week_start)
                    stats_dict[week_key] = {
                        "count": stat.count,
                        "revenue": float(stat.revenue or 0)
                    }

            weekly_addon_stats = (
                db.query(
                    func.date_trunc("week", Order.created_at).label("week_start"),
                    func.coalesce(func.sum(OrderAddon.price * OrderAddon.count), 0).label("rev"),
                )
                .select_from(OrderAddon)
                .join(Order, Order.id == OrderAddon.order_id)
                .filter(Order.created_at >= start_dt, Order.created_at <= end_dt)
                .group_by(func.date_trunc("week", Order.created_at))
                .all()
            )
            for stat in weekly_addon_stats:
                if not stat.week_start:
                    continue
                if isinstance(stat.week_start, datetime):
                    wk = str(stat.week_start.date())
                else:
                    wk = str(stat.week_start)
                if wk not in stats_dict:
                    stats_dict[wk] = {"count": 0, "revenue": 0.0}
                stats_dict[wk]["revenue"] += float(stat.rev or 0)
            
            # Fill in all weeks
            current = current_week_start
            while current <= end_week_start:
                week_key = str(current.date())
                week_end = current + timedelta(days=6)
                
                # Format label
                start_month = month_names[current.month]
                end_month = month_names[week_end.month]
                
                if current.year == week_end.year and current.month == week_end.month:
                    label = f"{current.day}-{week_end.day} {start_month} {current.year}"
                else:
                    label = f"{current.day} {start_month} - {week_end.day} {end_month} {week_end.year}"
                
                transaction_breakdown.append({
                    "period": week_key,
                    "label": label,
                    "count": stats_dict.get(week_key, {}).get("count", 0),
                    "revenue": stats_dict.get(week_key, {}).get("revenue", 0.0)
                })
                
                current += timedelta(days=7)
        
        else:  # monthly
            # Group by month using date_trunc
            monthly_stats = (
                base_query.with_entities(
                    func.date_trunc("month", Order.created_at).label("month_start"),
                    func.count(Order.id).label("count"),
                    func.sum(Order.additional_fee).label("revenue")
                )
                .group_by(func.date_trunc("month", Order.created_at))
                .order_by(func.date_trunc("month", Order.created_at))
                .all()
            )
            
            # Generate all months in range
            current_month_start = start_dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            end_month_start = end_dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            
            # Create dictionary from stats
            stats_dict = {}
            for stat in monthly_stats:
                if stat.month_start:
                    if isinstance(stat.month_start, datetime):
                        month_date = stat.month_start.date()
                    else:
                        month_date = stat.month_start
                    year_month = f"{month_date.year}-{month_date.month:02d}"
                    stats_dict[year_month] = {
                        "count": stat.count,
                        "revenue": float(stat.revenue or 0)
                    }

            monthly_addon_stats = (
                db.query(
                    func.date_trunc("month", Order.created_at).label("month_start"),
                    func.coalesce(func.sum(OrderAddon.price * OrderAddon.count), 0).label("rev"),
                )
                .select_from(OrderAddon)
                .join(Order, Order.id == OrderAddon.order_id)
                .filter(Order.created_at >= start_dt, Order.created_at <= end_dt)
                .group_by(func.date_trunc("month", Order.created_at))
                .all()
            )
            for stat in monthly_addon_stats:
                if not stat.month_start:
                    continue
                if isinstance(stat.month_start, datetime):
                    month_date = stat.month_start.date()
                else:
                    month_date = stat.month_start
                year_month = f"{month_date.year}-{month_date.month:02d}"
                if year_month not in stats_dict:
                    stats_dict[year_month] = {"count": 0, "revenue": 0.0}
                stats_dict[year_month]["revenue"] += float(stat.rev or 0)
            
            # Fill in all months
            current = current_month_start
            while current <= end_month_start:
                year_month = f"{current.year}-{current.month:02d}"
                
                transaction_breakdown.append({
                    "period": year_month,
                    "label": f"{month_names[current.month]} {current.year}",
                    "count": stats_dict.get(year_month, {}).get("count", 0),
                    "revenue": stats_dict.get(year_month, {}).get("revenue", 0.0)
                })
                
                # Move to next month
                if current.month == 12:
                    current = current.replace(year=current.year + 1, month=1)
                else:
                    current = current.replace(month=current.month + 1)
        
        return WebResponse(
            status="success",
            data={
                "period": period,
                "start_date": start_dt.isoformat(),
                "end_date": end_dt.isoformat(),
                "summary": {
                    "total_transactions": total_transactions,
                    "free_transactions": free_transactions,
                    "paid_transactions": paid_transactions,
                    "total_revenue": total_revenue
                },
                "breakdown": transaction_breakdown
            }
        )
    except Exception as e:
        # Log error for debugging
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error generating operational report: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error generating report: {str(e)}"
        )


@router.get("/orders-by-status", response_model=WebResponse[dict])
def get_orders_by_status(
    db: Session = Depends(get_db),
    # current_user: User = Depends(get_current_active_user),
):
    """
    Get order counts grouped by current_status for all orders.
    Returns e.g. { "by_status": [{ "status": "RECEIVED", "count": 2 }, ...] }.
    Frontend typically excludes PICKED_UP to show "order dalam proses".
    """
    try:
        rows = (
            db.query(Order.current_status, func.count(Order.id).label("count"))
            .group_by(Order.current_status)
            .all()
        )

        by_status = [{"status": str(row.current_status.value), "count": row.count} for row in rows]

        return WebResponse(
            status="success",
            data={"by_status": by_status},
        )
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"Error generating orders-by-status report: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
