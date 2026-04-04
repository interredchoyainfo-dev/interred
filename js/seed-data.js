import DB from './db.js';

const SEED_DATA = {
    // Flag to check if data has been seeded
    SEED_KEY: 'interred_data_seeded_v5',

    hasBeenSeeded() {
        return localStorage.getItem(this.SEED_KEY) === 'true';
    },

    markAsSeeded() {
        localStorage.setItem(this.SEED_KEY, 'true');
    },

    // Run seed only if not already done
    async run() {
        if (this.hasBeenSeeded()) {
            console.log('✅ Datos ya precargados.');
            return false;
        }

        console.log('🌱 Precargando base de datos de clientes...');

        const clients = this.getAllClients();

        // Clear existing clients to reload fresh data
        localStorage.removeItem(DB.KEYS.CLIENTS);

        for (const client of clients) {
            await DB.saveClient(client);
        }

        // Update settings with the correct WhatsApp messages
        this.updateSettings();

        this.markAsSeeded();
        console.log(`✅ ${clients.length} clientes precargados exitosamente.`);
        return true;
    },

    updateSettings() {
        const settings = {
            defaultAmount: 30000,
            phone: '3855374835',
            reminder10Enabled: true,
            reminder13Enabled: true,
            message10: 'Hola {nombre}, te saludamos de INTER RED 🌐. Te recordamos que hoy día 10 vence tu abono mensual de internet por un valor de ${monto}.\n\nEvitá recargos y cortes en el servicio. Si ya realizaste el pago, por favor enviá el comprobante por este medio.\n\n📍 Ubicación: Choya, Sgo. del Estero.\n📞 Dudas: {telefono}.',
            message13: '⚠️ AVISO IMPORTANTE - INTER RED ⚠️\n\nHola {nombre}, no hemos registrado el pago de tu servicio este mes.\n\nTe informamos que a partir de este momento tu velocidad de navegación ha sido reducida. Para normalizar tu servicio, por favor regularizá tu deuda de ${monto}.\n\nContacto: {telefono}. ¡Gracias!',
        };
        DB.saveSettings(settings);
    },

    getAllClients() {
        const clients = [];

        // ============================================
        // SOL DE MAYO (27 clientes)
        // ============================================
        const solDeMayo = [
            { nombre: 'EMANUEL', apellido: 'AREVALO', tel: '93856162032', ip: '192.168.20.173' },
            { nombre: 'EVE', apellido: 'ARGAÑARAZ', tel: '93856162023', ip: '192.168.20.155' },
            { nombre: 'MONICA', apellido: 'BARRIENTOS', tel: '93856164652', ip: '192.168.20.197' },
            { nombre: 'BETIANA', apellido: 'REINOSO', tel: '93855790543', ip: '192.168.20.165' },
            { nombre: 'LUCHO', apellido: 'BUSTAMANTE', tel: '93854063629', ip: '192.168.20.123' },
            { nombre: 'CARLOSCAR', apellido: '', tel: '938511671967', ip: '192.168.20.110' },
            { nombre: 'OLGA', apellido: 'CARRIZO', tel: '93855782795', ip: '192.168.20.211' },
            { nombre: 'JORGE', apellido: 'CASTAÑO', tel: '93856989850' },
            { nombre: 'GUSTAVO', apellido: 'CORONEL', tel: '93856138519', ip: '192.168.20.144' },
            { nombre: 'LOURDES', apellido: 'CORONEL', tel: '93854419960', ip: '192.168.20.40' },
            { nombre: 'MILAGROS', apellido: 'CORONEL', tel: '93854164682', ip: '192.168.20.143' },
            { nombre: 'EMANUEL', apellido: 'DIAZ', tel: '93854480966' },
            { nombre: 'GABRIEL', apellido: 'GONZALEZ', tel: '93856979378', ip: '192.168.20.185' },
            { nombre: 'ROMINA', apellido: 'INFANTES', tel: '93854456802', ip: '192.168.20.36' },
            { nombre: 'LUCIANA', apellido: 'JUAREZ', tel: '93855773083', ip: '192.168.20.232' },
            { nombre: 'VICTOR', apellido: 'LEZANA', tel: '93854445849' },
            { nombre: 'DANIEL', apellido: 'REINOSO', tel: '93855868021', ip: '192.168.20.127' },
            { nombre: 'NADIA', apellido: 'REINOSO', tel: '9385474448', ip: '192.168.20.216' },
            { nombre: 'ESTELA', apellido: 'RODRIGUEZ', tel: '93854687726', ip: '192.168.20.204' },
            { nombre: 'OLGA', apellido: 'RODRIGUEZ', tel: '93854436258', ip: '192.168.20.225' },
            { nombre: 'SANDRA', apellido: 'RODRIGUEZ', tel: '93856162039' },
            { nombre: 'ALICIA', apellido: 'SANTILLAN', tel: '93854846151', ip: '192.168.20.205' },
            { nombre: 'FLORENCIA', apellido: 'SANTILLAN', tel: '93854261704', ip: '192.168.20.16' },
            { nombre: 'JOSE', apellido: 'SANTILLAN', tel: '93855838458', ip: '192.168.20.126' },
            { nombre: 'CINTIA', apellido: 'VARELA', tel: '93854841360', ip: '192.168.20.234' },
            { nombre: 'KELY', apellido: 'VARELA', tel: '93855790549', ip: '192.168.20.230' },
            { nombre: 'LIDIO', apellido: 'VARELA', tel: '91166522985', ip: '192.168.20.18' },
        ];

        solDeMayo.forEach(c => {
            clients.push({
                nombre: c.nombre,
                apellido: c.apellido,
                zona: 'SOL DE MAYO',
                whatsapp: c.tel,
                ip: c.ip || '',
                estado: 'Activo',
            });
        });

        // ============================================
        // VILLA LA PUNTA (40 clientes)
        // ============================================
        const villaLaPunta = [
            { nombre: 'ANTONIA', apellido: 'ALAGASTIN', tel: '93854686740', ip: '192.168.20.190' },
            { nombre: 'RITA', apellido: 'ALAGASTIN', tel: '93854479229', ip: '192.168.20.118' },
            { nombre: 'ALBA LUZ', apellido: 'AREVALO', tel: '93854744714', ip: '192.168.20.148' },
            { nombre: 'DELIA', apellido: 'AREVALO', tel: '93854471246', ip: '192.168.20.35' },
            { nombre: 'MARINA', apellido: 'BARRIENTOS', tel: '93854810675', ip: '192.168.20.158' },
            { nombre: 'MERCEDES', apellido: 'BARRIENTOS', tel: '93854446748', ip: '192.168.20.199' },
            { nombre: 'ROXANA', apellido: 'BARRIENTOS', tel: '93854472585', ip: '192.168.20.215' },
            { nombre: 'LORENA', apellido: 'BOISSERENE', tel: '93855759296', ip: '192.168.20.213' },
            { nombre: 'GABY', apellido: 'BRAVO', tel: '93854476647', ip: '192.168.20.202' },
            { nombre: 'LUIS', apellido: 'BRAVO', tel: '93854452972', ip: '192.168.20.220' },
            { nombre: 'JOAQUIN', apellido: 'BURGOS', tel: '93855375056', ip: '192.168.20.129' },
            { nombre: 'JORGE', apellido: 'CABRERA', tel: '93856180148', ip: '192.168.20.239' },
            { nombre: 'ALEJANDRO', apellido: 'CARRIZO', tel: '93855011882', ip: '192.168.20.150' },
            { nombre: 'CESAR', apellido: 'CASAS', tel: '93854693635', ip: '192.168.20.140' },
            { nombre: 'ANA', apellido: 'CASTAÑO', tel: '93854409850', ip: '192.168.20.25' },
            { nombre: 'CULLI', apellido: 'CASTAÑO', tel: '93853161312', ip: '192.168.20.39' },
            { nombre: 'SANDRA', apellido: 'CASTAÑO', tel: '93854445402', ip: '192.168.20.145' },
            { nombre: 'RICKY', apellido: 'CORONEL', tel: '93854686045', ip: '192.168.20.133' },
            { nombre: 'MIGUEL', apellido: 'CUELLO', tel: '93854477296', ip: '192.168.20.209' },
            { nombre: 'KAREN', apellido: 'DIAZ', tel: '93854061590' },
            { nombre: 'VALERIA', apellido: 'DIAZ', tel: '93855817660', ip: '192.168.20.238' },
            { nombre: 'ANA', apellido: 'FERREIRA', tel: '93855746962', ip: '192.168.20.218' },
            { nombre: 'MARCELO', apellido: 'GARAY', tel: '92304260538', ip: '192.168.20.206' },
            { nombre: 'ANTONELLA', apellido: 'GONZALEZ', tel: '93854989488', ip: '192.168.20.152' },
            { nombre: 'HOSTAL', apellido: '', tel: '93854733226', ip: '192.168.20.146' },
            { nombre: 'DANIELA', apellido: 'ITURBE', tel: '93853128636', ip: '192.168.20.198' },
            { nombre: 'ROCIO', apellido: 'JUAREZ', tel: '91157224597', ip: '192.168.20.178' },
            { nombre: 'LAZARTE', apellido: '', tel: '93854852027', ip: '192.168.20.141' },
            { nombre: 'DANA', apellido: 'LEDEZMA', tel: '93854384115', ip: '192.168.20.34' },
            { nombre: 'JULIO', apellido: 'MALDONADO', tel: '93854474215', ip: '192.168.20.99' },
            { nombre: 'SANDRA', apellido: 'MALDONADO', tel: '93855825986', ip: '192.168.20.138' },
            { nombre: 'RUBEN', apellido: 'MEDINA', tel: '93854115664', ip: '192.168.20.128' },
            { nombre: 'YOVANA', apellido: 'MIRANDA', tel: '93855719986', ip: '192.168.20.157' },
            { nombre: 'LEO', apellido: 'MOLINA', tel: '93854882348', ip: '192.168.20.97' },
            { nombre: 'GISEL', apellido: 'PEREZ', tel: '93855934025', ip: '192.168.20.134' },
            { nombre: 'RODILLA', apellido: '', tel: '93854474541' },
            { nombre: 'JAVIER', apellido: 'SUELDO', tel: '93832417209', ip: '192.168.20.41' },
            { nombre: 'MATIAS', apellido: 'SUELDO', tel: '93854492517' },
            { nombre: 'LUIS', apellido: 'TOLEDO', tel: '93854497169', ip: '192.168.20.160' },
            { nombre: 'VANESA', apellido: 'AVILA', tel: '93854475081', ip: '192.168.20.87' },
        ];

        villaLaPunta.forEach(c => {
            clients.push({
                nombre: c.nombre,
                apellido: c.apellido,
                zona: 'VILLA LA PUNTA',
                whatsapp: c.tel,
                ip: c.ip || '',
                estado: 'Activo',
            });
        });

        // ============================================
        // CHOYA (44 clientes)
        // ============================================
        const choya = [
            { nombre: 'BLANCA', apellido: 'ACOSTA' },
            { nombre: 'LUCIA', apellido: 'AGUIRRE' },
            { nombre: 'ESTEBAN', apellido: 'ALBARRACIN' },
            { nombre: 'YONATAN', apellido: 'ALBARRACIN' },
            { nombre: 'GLADIS', apellido: 'BRAVO' },
            { nombre: 'LOURDES', apellido: 'BRAVO' },
            { nombre: 'NIMIA', apellido: 'CARILLO' },
            { nombre: 'ERICA', apellido: 'CARRIZO' },
            { nombre: 'ALEJANDRA', apellido: 'CHAZARRETA' },
            { nombre: 'YANINA', apellido: 'CHAZARRETA' },
            { nombre: 'JOHANA', apellido: 'CORTEZ' },
            { nombre: 'CRIA CHOYA', apellido: '' },
            { nombre: 'NANCY', apellido: 'DIAZ' },
            { nombre: 'SANTIAGO', apellido: 'DIAZ' },
            { nombre: 'DANIEL', apellido: 'FERREYRA' },
            { nombre: 'GABRIELA', apellido: 'FERREYRA' },
            { nombre: 'FERNANDA', apellido: 'GOMEZ' },
            { nombre: 'JAVIER', apellido: 'GOMEZ' },
            { nombre: 'SOLEDAD', apellido: 'GOMEZ' },
            { nombre: 'MARIA', apellido: 'GONZALEZ' },
            { nombre: 'GUILLERMO', apellido: 'GUTIERREZ' },
            { nombre: 'AZUCENA', apellido: 'GUTIERREZ' },
            { nombre: 'JOSE', apellido: 'JUAREZ' },
            { nombre: 'DIEGO', apellido: 'LEIVA' },
            { nombre: 'OSCAR', apellido: 'LEIVA' },
            { nombre: 'RUBEN', apellido: 'LEIVA' },
            { nombre: 'VICKY', apellido: 'LEIVA' },
            { nombre: 'MARCELO', apellido: 'MALDONADO' },
            { nombre: 'NIDIA', apellido: 'MAZA' },
            { nombre: 'NOELIA', apellido: 'MEDINA' },
            { nombre: 'LOURDES', apellido: 'NIETO' },
            { nombre: 'YOANA', apellido: 'PEDERNERA' },
            { nombre: 'ROSA', apellido: 'IÑIGUEZ' },
            { nombre: 'GABRIELA', apellido: 'SARRIA' },
            { nombre: 'BIANCA', apellido: 'SANTILLAN' },
            { nombre: 'LALO', apellido: 'SANTILLAN' },
            { nombre: 'LUCIA', apellido: 'TOFANELLI' },
            { nombre: 'RITO', apellido: 'TOFANELLI' },
            { nombre: 'MERCEDES', apellido: 'VALLEJO' },
            { nombre: 'ISMAEL', apellido: 'VIZCARRA' },
            { nombre: 'CHONI', apellido: '' },
            { nombre: 'SUB COMISARIA', apellido: '' },
            { nombre: 'GRACIELA', apellido: 'GUERRA' },
            { nombre: 'LULO', apellido: 'BAZAN' },
        ];

        choya.forEach(c => {
            clients.push({
                nombre: c.nombre,
                apellido: c.apellido,
                zona: 'CHOYA',
                whatsapp: '',
                ip: c.ip || '',
                estado: 'Activo',
            });
        });

        // ============================================
        // FRIAS (11 clientes - excluyendo entradas vacías)
        // ============================================
        const frias = [
            { nombre: 'CECILIA', apellido: 'ALBARRACIN' },
            { nombre: 'ELI', apellido: 'FLEITA' },
            { nombre: 'AZUCENA', apellido: 'GUTIERREZ' },
            { nombre: 'RAMON', apellido: 'HERRERA' },
            { nombre: 'ADRIANA', apellido: 'LOPEZ' },
            { nombre: 'VERONICA', apellido: 'PEREA' },
            { nombre: 'ROMERO', apellido: '' },
            { nombre: 'PABLO', apellido: 'SECO' },
            { nombre: 'CELE', apellido: 'DOMINGUEZ' },
            { nombre: 'ESTRADA', apellido: '' },
            { nombre: 'ROLANDO', apellido: '' },
        ];

        frias.forEach(c => {
            clients.push({
                nombre: c.nombre,
                apellido: c.apellido,
                zona: 'FRIAS',
                whatsapp: '',
                ip: c.ip || '',
                estado: 'Activo',
            });
        });

        return clients;
    },
};

window.SEED_DATA = SEED_DATA;
export default SEED_DATA;
