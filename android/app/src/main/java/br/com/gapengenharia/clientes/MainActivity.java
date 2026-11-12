package br.com.gapengenharia.clientes;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GapWifiPlugin.class);   // (12/11) "Conectar inversor": UDP com o datalogger
        super.onCreate(savedInstanceState);
    }
}
