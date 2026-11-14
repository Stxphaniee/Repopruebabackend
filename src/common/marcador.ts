import { EstadoPartido, TipoEvento } from '@PrismaClient';

export interface EventoConEquipo {
  tipo: TipoEvento;
  jugador: { equipoId: string };
}

/**
 * H7/H8/H10: el marcador se deriva SIEMPRE de los eventos GOL; nunca se
 * almacena. Un gol suma al equipo del jugador que lo anotó.
 */
export function calcularMarcador(
  partido: { equipoLocalId: string; equipoVisitanteId: string; estado: EstadoPartido },
  eventos: EventoConEquipo[],
): { local: number; visitante: number } | null {
  if (partido.estado === EstadoPartido.SUSPENDIDO || partido.estado === EstadoPartido.CANCELADO) {
    return null; // H8: SUSPENDIDOS y CANCELADOS se listan sin marcador.
  }
  let local = 0;
  let visitante = 0;
  for (const e of eventos) {
    if (e.tipo !== TipoEvento.GOL) continue;
    if (e.jugador.equipoId === partido.equipoLocalId) local++;
    else if (e.jugador.equipoId === partido.equipoVisitanteId) visitante++;
  }
  return { local, visitante };
}

export const PARTIDO_DURACION_MIN = 90;
