from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from .models import Society, Unit
from .serializers import SocietySerializer, SocietyProvisionSerializer, UnitSerializer
import logging

logger = logging.getLogger(__name__)

class SocietyProvisionView(APIView):
    """
    Provisions a new residential society/apartment complex and auto-generates
    the entire physical matrix of units and floor directories.
    """
    def post(self, request):
        serializer = SocietyProvisionSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        data = serializer.validated_data
        society_id = data['society_id']
        floors = data['number_of_floors']
        units_per_floor = data['units_per_floor']
        total_units = floors * units_per_floor

        # 1. Create or update Society entity
        society, created = Society.objects.get_or_create(
            id=society_id,
            defaults={
                'name': data['name'],
                'address': data['address'],
                'admin_email': data['admin_email'],
                'number_of_floors': floors,
                'units_per_floor': units_per_floor,
                'total_apartments': total_units,
                'is_setup_complete': True
            }
        )

        if not created:
            society.name = data['name']
            society.address = data['address']
            society.number_of_floors = floors
            society.units_per_floor = units_per_floor
            society.total_apartments = total_units
            society.is_setup_complete = True
            society.save()

        # 2. Auto-generate physical units matrix
        units_to_create = []
        for f in range(1, floors + 1):
            for u in range(1, units_per_floor + 1):
                unit_number = f"{f}{u:02d}"
                if not Unit.objects.filter(society=society, unit_number=unit_number).exists():
                    units_to_create.append(
                        Unit(
                            society=society,
                            unit_number=unit_number,
                            floor_number=f,
                            status='unoccupied'
                        )
                    )

        if units_to_create:
            Unit.objects.bulk_create(units_to_create)

        return Response(
            {
                "message": "Society matrix provisioned successfully",
                "society_id": society.id,
                "total_units_created": len(units_to_create),
                "total_apartments": total_units
            },
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )

class SocietyDetailView(APIView):
    """Fetches details and units directory for a specific society."""
    def get(self, request, society_id):
        try:
            society = Society.objects.prefetch_related('units').get(id=society_id)
            serializer = SocietySerializer(society)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Society.DoesNotExist:
            return Response({"error": "Society not found"}, status=status.HTTP_404_NOT_FOUND)

class UnitStatusUpdateView(APIView):
    """Updates unit occupancy and tenant assignment."""
    def patch(self, request, society_id, unit_number):
        try:
            unit = Unit.objects.get(society_id=society_id, unit_number=unit_number)
            new_status = request.data.get('status')
            occupied_by = request.data.get('occupied_by')
            
            if new_status:
                unit.status = new_status
            if occupied_by is not None:
                unit.occupied_by = occupied_by
            unit.save()

            return Response(UnitSerializer(unit).data, status=status.HTTP_200_OK)
        except Unit.DoesNotExist:
            return Response({"error": "Unit not found"}, status=status.HTTP_404_NOT_FOUND)
