from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.utils import timezone
from .models import MaintenanceTicket
from .serializers import MaintenanceTicketSerializer, CreateTicketSerializer

class TicketListCreateView(APIView):
    """Lists complaints or creates a new maintenance work order."""
    def get(self, request, society_id):
        unit_number = request.query_params.get('unit')
        queryset = MaintenanceTicket.objects.filter(society_id=society_id)
        if unit_number:
            queryset = queryset.filter(unit_number=unit_number)
        
        serializer = MaintenanceTicketSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request, society_id):
        serializer = CreateTicketSerializer(data={**request.data, 'society_id': society_id})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        ticket = MaintenanceTicket.objects.create(**serializer.validated_data)
        return Response(MaintenanceTicketSerializer(ticket).data, status=status.HTTP_201_CREATED)

class TicketStatusUpdateView(APIView):
    """Updates complaint lifecycle state (open -> in_progress -> resolved)."""
    def patch(self, request, society_id, ticket_id):
        try:
            ticket = MaintenanceTicket.objects.get(id=ticket_id, society_id=society_id)
            new_status = request.data.get('status')
            if new_status in ['open', 'in_progress', 'resolved', 'closed']:
                ticket.status = new_status
                if new_status == 'resolved':
                    ticket.resolved_at = timezone.now()
                ticket.save()
                return Response(MaintenanceTicketSerializer(ticket).data, status=status.HTTP_200_OK)
            return Response({"error": "Invalid status choice"}, status=status.HTTP_400_BAD_REQUEST)
        except MaintenanceTicket.DoesNotExist:
            return Response({"error": "Ticket not found"}, status=status.HTTP_404_NOT_FOUND)
