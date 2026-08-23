from django.urls import path
from apps.societies.views import SocietyProvisionView, SocietyDetailView, UnitStatusUpdateView
from apps.tickets.views import TicketListCreateView, TicketStatusUpdateView

urlpatterns = [
    # Society endpoints
    path('api/societies/provision/', SocietyProvisionView.as_view(), name='society-provision'),
    path('api/societies/<str:society_id>/', SocietyDetailView.as_view(), name='society-detail'),
    path('api/societies/<str:society_id>/units/<str:unit_number>/', UnitStatusUpdateView.as_view(), name='unit-update'),

    # Tickets endpoints
    path('api/societies/<str:society_id>/tickets/', TicketListCreateView.as_view(), name='tickets-list-create'),
    path('api/societies/<str:society_id>/tickets/<uuid:ticket_id>/', TicketStatusUpdateView.as_view(), name='ticket-status-update'),
]
