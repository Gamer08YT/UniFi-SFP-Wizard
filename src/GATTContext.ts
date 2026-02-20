interface GATTContext {
    commandChar: BluetoothRemoteGATTCharacteristic;
    notifyChar?: BluetoothRemoteGATTCharacteristic;
    infoChar: BluetoothRemoteGATTCharacteristic;
}