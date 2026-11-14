import crypto from 'node:crypto';
import 'dotenv/config';
import bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  Cancha,
  CategoriaNotificacion,
  EstadoEquipo,
  EstadoJornada,
  EstadoPago,
  EstadoPartido,
  Posicion,
  PrismaClient,
  RolUsuario,
  TipoEvento,
} from '../src/generated/prisma/client.js';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('--- Iniciando seed de la base de datos ---');

  const defaultPasswordHash = await bcrypt.hash('Password123!', 10);

  // 1. Temporada activa
  const temporada = await prisma.temporada.upsert({
    where: { id: '00000000-0000-4000-8000-000000000001' },
    update: {
      nombre: 'Liga Mayor Amateur - Temporada 2026',
      activa: true,
      cuotaInscripcion: 150.0,
      inscripcionInicio: new Date('2026-11-01T00:00:00Z'),
      inscripcionFin: new Date('2026-11-15T23:59:59Z'),
      altasBajasInicio: new Date('2026-11-16T00:00:00Z'),
      altasBajasFin: new Date('2026-12-15T23:59:59Z'),
    },
    create: {
      id: '00000000-0000-4000-8000-000000000001',
      nombre: 'Liga Mayor Amateur - Temporada 2026',
      activa: true,
      cuotaInscripcion: 150.0,
      inscripcionInicio: new Date('2026-11-01T00:00:00Z'),
      inscripcionFin: new Date('2026-11-15T23:59:59Z'),
      altasBajasInicio: new Date('2026-11-16T00:00:00Z'),
      altasBajasFin: new Date('2026-12-15T23:59:59Z'),
    },
  });
  console.log('Temporada activa asegurada:', temporada.nombre);

  // 2. Usuarios: 1 Organizador, 3 Árbitros, 6 Capitanes, 12 Jugadores
  // 2.1 Organizador
  const orgUser = await prisma.user.upsert({
    where: { email: 'admin@ligaamateur.com' },
    update: { rol: RolUsuario.ORGANIZADOR, isActive: true },
    create: {
      email: 'admin@ligaamateur.com',
      passwordHash: defaultPasswordHash,
      rol: RolUsuario.ORGANIZADOR,
      isActive: true,
    },
  });
  await prisma.userProfile.upsert({
    where: { userId: orgUser.id },
    update: { nombreCompleto: 'Carlos Méndez', dui: '01234567-8' },
    create: {
      userId: orgUser.id,
      nombreCompleto: 'Carlos Méndez',
      dui: '01234567-8',
    },
  });

  // 2.2 Árbitros
  const arbitrosData = [
    { email: 'arbitro1@ligaamateur.com', nombre: 'Roberto Gómez', dui: '02345678-1' },
    { email: 'arbitro2@ligaamateur.com', nombre: 'Manuel Rivas', dui: '02345678-2' },
    { email: 'arbitro3@ligaamateur.com', nombre: 'Fernando Flores', dui: '02345678-3' },
  ];
  const arbitros = [];
  for (const arb of arbitrosData) {
    const u = await prisma.user.upsert({
      where: { email: arb.email },
      update: { rol: RolUsuario.ARBITRO, isActive: true },
      create: {
        email: arb.email,
        passwordHash: defaultPasswordHash,
        rol: RolUsuario.ARBITRO,
        isActive: true,
      },
    });
    await prisma.userProfile.upsert({
      where: { userId: u.id },
      update: { nombreCompleto: arb.nombre, dui: arb.dui },
      create: { userId: u.id, nombreCompleto: arb.nombre, dui: arb.dui },
    });
    arbitros.push(u);
  }

  // 2.3 Capitanes
  const capitanesData = [
    { email: 'capitan1@ligaamateur.com', nombre: 'Juan Pérez', dui: '03456789-1' },
    { email: 'capitan2@ligaamateur.com', nombre: 'Mario López', dui: '03456789-2' },
    { email: 'capitan3@ligaamateur.com', nombre: 'David Cruz', dui: '03456789-3' },
    { email: 'capitan4@ligaamateur.com', nombre: 'Alejandro Ramos', dui: '03456789-4' },
    { email: 'capitan5@ligaamateur.com', nombre: 'Diego Castillo', dui: '03456789-5' },
    { email: 'capitan6@ligaamateur.com', nombre: 'Luis Hernández', dui: '03456789-6' },
  ];
  const capitanes = [];
  for (const cap of capitanesData) {
    const u = await prisma.user.upsert({
      where: { email: cap.email },
      update: { rol: RolUsuario.CAPITAN, isActive: true },
      create: {
        email: cap.email,
        passwordHash: defaultPasswordHash,
        rol: RolUsuario.CAPITAN,
        isActive: true,
      },
    });
    await prisma.userProfile.upsert({
      where: { userId: u.id },
      update: { nombreCompleto: cap.nombre, dui: cap.dui },
      create: { userId: u.id, nombreCompleto: cap.nombre, dui: cap.dui },
    });
    capitanes.push(u);
  }

  // 2.4 Jugadores con cuenta (2 por cada equipo = 12)
  const jugadorUsuarios = [];
  for (let teamIdx = 1; teamIdx <= 6; teamIdx++) {
    for (let jIdx = 1; jIdx <= 2; jIdx++) {
      const email = `jugador${teamIdx}_${jIdx}@ligaamateur.com`;
      const dui = `045678${teamIdx.toString().padStart(2, '0')}-${jIdx}`;
      const nombre = `Jugador ${teamIdx}-${jIdx}`;
      const u = await prisma.user.upsert({
        where: { email },
        update: { rol: RolUsuario.JUGADOR, isActive: true },
        create: {
          email,
          passwordHash: defaultPasswordHash,
          rol: RolUsuario.JUGADOR,
          isActive: true,
        },
      });
      await prisma.userProfile.upsert({
        where: { userId: u.id },
        update: { nombreCompleto: nombre, dui },
        create: { userId: u.id, nombreCompleto: nombre, dui },
      });
      jugadorUsuarios.push({ user: u, teamIdx, jIdx, nombre, dui });
    }
  }

  // 3. Equipos y Pagos
  const equiposConfig = [
    {
      nombre: 'Los Halcones FC',
      estado: EstadoEquipo.APROBADO,
      capitan: capitanes[0],
      pagoEstado: EstadoPago.PAGADO,
      pagoUltimos4: '4242',
      pagoFechaPago: new Date(),
      pagoVence: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    {
      nombre: 'Furias del Norte',
      estado: EstadoEquipo.APROBADO,
      capitan: capitanes[1],
      pagoEstado: EstadoPago.PAGADO,
      pagoUltimos4: '4242',
      pagoFechaPago: new Date(),
      pagoVence: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    {
      nombre: 'Atlético San Salvador',
      estado: EstadoEquipo.APROBADO,
      capitan: capitanes[2],
      pagoEstado: EstadoPago.PAGADO,
      pagoUltimos4: '4242',
      pagoFechaPago: new Date(),
      pagoVence: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    {
      nombre: 'Deportivo Cuscatlán',
      estado: EstadoEquipo.APROBADO,
      capitan: capitanes[3],
      pagoEstado: EstadoPago.PAGADO,
      pagoUltimos4: '4242',
      pagoFechaPago: new Date(),
      pagoVence: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    {
      nombre: 'Real Santa Tecla',
      estado: EstadoEquipo.PENDIENTE_VALIDACION,
      capitan: capitanes[4],
      pagoEstado: EstadoPago.PENDIENTE,
      pagoUltimos4: null,
      pagoFechaPago: null,
      pagoVence: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    },
    {
      nombre: 'Juventud Olímpica',
      estado: EstadoEquipo.APROBADO,
      capitan: capitanes[5],
      pagoEstado: EstadoPago.VENCIDO,
      pagoUltimos4: null,
      pagoFechaPago: null,
      pagoVence: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // Vencido hace 5 días
    },
  ];

  const equipos = [];
  for (let i = 0; i < equiposConfig.length; i++) {
    const cfg = equiposConfig[i];
    const equipo = await prisma.equipo.upsert({
      where: {
        temporadaId_capitanId: {
          temporadaId: temporada.id,
          capitanId: cfg.capitan.id,
        },
      },
      update: {
        nombre: cfg.nombre,
        estado: cfg.estado,
      },
      create: {
        temporadaId: temporada.id,
        capitanId: cfg.capitan.id,
        nombre: cfg.nombre,
        estado: cfg.estado,
      },
    });

    await prisma.pago.upsert({
      where: { equipoId: equipo.id },
      update: {
        monto: 150.0,
        estado: cfg.pagoEstado,
        ultimos4: cfg.pagoUltimos4,
        fechaPago: cfg.pagoFechaPago,
        fechaVencimiento: cfg.pagoVence,
        comprobanteId: cfg.pagoEstado === EstadoPago.PAGADO ? crypto.randomUUID() : null,
      },
      create: {
        equipoId: equipo.id,
        monto: 150.0,
        estado: cfg.pagoEstado,
        ultimos4: cfg.pagoUltimos4,
        fechaPago: cfg.pagoFechaPago,
        fechaVencimiento: cfg.pagoVence,
        comprobanteId: cfg.pagoEstado === EstadoPago.PAGADO ? crypto.randomUUID() : null,
      },
    });

    equipos.push(equipo);

    // 4. Jugadores (8 jugadores por equipo)
    const posiciones: Posicion[] = [
      Posicion.PORTERO,
      Posicion.DEFENSA,
      Posicion.DEFENSA,
      Posicion.DEFENSA,
      Posicion.MEDIOCAMPISTA,
      Posicion.MEDIOCAMPISTA,
      Posicion.DELANTERO,
      Posicion.DELANTERO,
    ];

    const teamNum = i + 1;
    for (let j = 0; j < 8; j++) {
      const camiseta = j + 1;
      const dui = `0500${teamNum.toString().padStart(2, '0')}${camiseta.toString().padStart(2, '0')}-0`;
      const nombre = `Jugador ${teamNum}-${camiseta}`;
      const posicion = posiciones[j];
      const nacimiento = new Date(1995 + (j % 8), (j * 2) % 12, 10);

      // Vincular cuenta a los dos primeros jugadores
      let usuarioId: string | null = null;
      if (j === 0 || j === 1) {
        const uObj = jugadorUsuarios.find(
          (ju) => ju.teamIdx === teamNum && ju.jIdx === j + 1,
        );
        if (uObj) usuarioId = uObj.user.id;
      }

      await prisma.jugador.upsert({
        where: { dui },
        update: {
          nombre,
          posicion,
          numeroCamiseta: camiseta,
          equipoId: equipo.id,
          fechaNacimiento: nacimiento,
          usuarioId,
          fechaBaja: null,
        },
        create: {
          dui,
          nombre,
          posicion,
          numeroCamiseta: camiseta,
          equipoId: equipo.id,
          fechaNacimiento: nacimiento,
          usuarioId,
          fechaBaja: null,
        },
      });
    }
  }
  console.log('Equipos y jugadores creados correctamente');

  // 5. Jornadas y Partidos
  // 5.1 Jornada 1: PUBLICADA
  const jornada1 = await prisma.jornada.upsert({
    where: {
      temporadaId_numero: {
        temporadaId: temporada.id,
        numero: 1,
      },
    },
    update: {
      estado: EstadoJornada.PUBLICADA,
      publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    },
    create: {
      temporadaId: temporada.id,
      numero: 1,
      estado: EstadoJornada.PUBLICADA,
      publishedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    },
  });

  // Partido 1 (FINALIZADO): Halcones (Eq 0) vs Furias (Eq 1)
  const inicioP1 = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const finP1 = new Date(inicioP1.getTime() + 90 * 60 * 1000);

  let partido1 = await prisma.partido.findFirst({
    where: {
      jornadaId: jornada1.id,
      equipoLocalId: equipos[0].id,
      equipoVisitanteId: equipos[1].id,
    },
  });

  if (!partido1) {
    partido1 = await prisma.partido.create({
      data: {
        jornadaId: jornada1.id,
        equipoLocalId: equipos[0].id,
        equipoVisitanteId: equipos[1].id,
        arbitroId: arbitros[0].id,
        cancha: Cancha.A,
        fechaHoraInicio: inicioP1,
        fechaHoraFin: finP1,
        estado: EstadoPartido.FINALIZADO,
      },
    });
  } else {
    partido1 = await prisma.partido.update({
      where: { id: partido1.id },
      data: {
        arbitroId: arbitros[0].id,
        cancha: Cancha.A,
        fechaHoraInicio: inicioP1,
        fechaHoraFin: finP1,
        estado: EstadoPartido.FINALIZADO,
      },
    });
  }

  // Participantes y Eventos de Partido 1
  const jugadoresEq0 = await prisma.jugador.findMany({ where: { equipoId: equipos[0].id } });
  const jugadoresEq1 = await prisma.jugador.findMany({ where: { equipoId: equipos[1].id } });

  // Registrar participantes
  for (const j of [...jugadoresEq0, ...jugadoresEq1]) {
    await prisma.participacionPartido.upsert({
      where: {
        partidoId_jugadorId: {
          partidoId: partido1.id,
          jugadorId: j.id,
        },
      },
      update: { participo: true },
      create: {
        partidoId: partido1.id,
        jugadorId: j.id,
        participo: true,
      },
    });
  }

  // Eventos: 2 goles local, 1 gol visitante, 1 asistencia, 1 amarilla
  // Limpiar eventos anteriores para consistencia
  await prisma.eventoPartido.deleteMany({ where: { partidoId: partido1.id } });

  // Gol 1 Local (min 15)
  await prisma.eventoPartido.create({
    data: {
      partidoId: partido1.id,
      jugadorId: jugadoresEq0[6].id, // Delantero
      tipo: TipoEvento.GOL,
      minuto: 15,
    },
  });

  // Gol 2 Local (min 30) con asistencia de mediocampista
  const gol2 = await prisma.eventoPartido.create({
    data: {
      partidoId: partido1.id,
      jugadorId: jugadoresEq0[7].id, // Delantero
      tipo: TipoEvento.GOL,
      minuto: 30,
    },
  });

  await prisma.eventoPartido.create({
    data: {
      partidoId: partido1.id,
      jugadorId: jugadoresEq0[4].id, // Mediocampista
      tipo: TipoEvento.ASISTENCIA,
      minuto: 30,
      golRelacionadoId: gol2.id,
    },
  });

  // Gol 1 Visitante (min 60)
  await prisma.eventoPartido.create({
    data: {
      partidoId: partido1.id,
      jugadorId: jugadoresEq1[6].id, // Delantero
      tipo: TipoEvento.GOL,
      minuto: 60,
    },
  });

  // Tarjeta Amarilla (min 75)
  await prisma.eventoPartido.create({
    data: {
      partidoId: partido1.id,
      jugadorId: jugadoresEq1[1].id, // Defensa
      tipo: TipoEvento.AMARILLA,
      minuto: 75,
    },
  });

  // Partido 2 (PROGRAMADO): Atlético San Salvador (Eq 2) vs Deportivo Cuscatlán (Eq 3)
  const inicioP2 = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // En 2 días
  inicioP2.setHours(15, 0, 0, 0);
  const finP2 = new Date(inicioP2.getTime() + 90 * 60 * 1000);

  let partido2 = await prisma.partido.findFirst({
    where: {
      jornadaId: jornada1.id,
      equipoLocalId: equipos[2].id,
      equipoVisitanteId: equipos[3].id,
    },
  });

  if (!partido2) {
    await prisma.partido.create({
      data: {
        jornadaId: jornada1.id,
        equipoLocalId: equipos[2].id,
        equipoVisitanteId: equipos[3].id,
        arbitroId: arbitros[1].id,
        cancha: Cancha.B,
        fechaHoraInicio: inicioP2,
        fechaHoraFin: finP2,
        estado: EstadoPartido.PROGRAMADO,
      },
    });
  } else {
    await prisma.partido.update({
      where: { id: partido2.id },
      data: {
        arbitroId: arbitros[1].id,
        cancha: Cancha.B,
        fechaHoraInicio: inicioP2,
        fechaHoraFin: finP2,
        estado: EstadoPartido.PROGRAMADO,
      },
    });
  }

  // 5.2 Jornada 2: BORRADOR
  await prisma.jornada.upsert({
    where: {
      temporadaId_numero: {
        temporadaId: temporada.id,
        numero: 2,
      },
    },
    update: {
      estado: EstadoJornada.BORRADOR,
      publishedAt: null,
    },
    create: {
      temporadaId: temporada.id,
      numero: 2,
      estado: EstadoJornada.BORRADOR,
    },
  });
  console.log('Jornadas y partidos configurados');

  // 6. Preferencias de notificación para los usuarios principales
  const usuariosNotificaciones = [orgUser, ...arbitros, ...capitanes];
  for (const u of usuariosNotificaciones) {
    for (const cat of Object.values(CategoriaNotificacion)) {
      await prisma.preferenciaNotificacion.upsert({
        where: {
          usuarioId_categoria: {
            usuarioId: u.id,
            categoria: cat,
          },
        },
        update: { activa: true },
        create: {
          usuarioId: u.id,
          categoria: cat,
          activa: true,
        },
      });
    }
  }
  console.log('Preferencias de notificación inicializadas');

  console.log('--- Seed completado con éxito ---');
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
