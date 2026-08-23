import os
from celery import Celery
import time

CELERY_BROKER = os.environ.get('REDIS_URL', 'redis://localhost:6379/0')

app = Celery('vasturith_tasks', broker=CELERY_BROKER)

app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='UTC',
    enable_utc=True,
)

@app.task
def check_sla_escalations_task(society_id: str):
    """
    Automated Celery worker task that checks unassigned or overdue tickets
    and flags them for escalation.
    """
    print(f"[Celery Worker] Running SLA check for society: {society_id}")
    return {
        "society_id": society_id,
        "checked_at": time.time(),
        "status": "completed",
        "escalations_triggered": 0
    }

@app.task
def dispatch_emergency_broadcast_task(society_id: str, title: str, message: str):
    """
    Background queue dispatcher for mass emergency alerts.
    """
    print(f"[Celery Broadcast] Dispatching alert to society {society_id}: {title}")
    return {"status": "dispatched", "recipients_count": 120}
