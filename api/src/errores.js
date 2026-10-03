// Errores "esperados" de la API: se responden al cliente con su status y mensaje.
// Cualquier otro error se considera interno y el cliente recibe un mensaje genérico.

export class ErrorHttp extends Error {
  constructor(status, codigo, mensaje) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
  }
}

export const errorValidacion = (mensaje) => new ErrorHttp(400, 'PARAMETRO_INVALIDO', mensaje);
export const errorNoEncontrado = (mensaje) => new ErrorHttp(404, 'NO_ENCONTRADO', mensaje);
