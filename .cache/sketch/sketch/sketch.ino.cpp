#include <Arduino.h>
#line 1 "/home/arduino/ArduinoApps/EsparregsBCN/sketch/sketch.ino"
#include <Arduino_LED_Matrix.h>

Arduino_LED_Matrix matrix;

uint32_t frame1[5] = {
  0x0181b20b, 0x986bc2e6, 0x1b200600, 0x00000000, 1000
};

uint32_t frame2[5] = {
  0x00c31911, 0xccc5e473, 0x31900300, 0x00000000, 1000
};

#line 13 "/home/arduino/ArduinoApps/EsparregsBCN/sketch/sketch.ino"
void setup();
#line 17 "/home/arduino/ArduinoApps/EsparregsBCN/sketch/sketch.ino"
void loop();
#line 13 "/home/arduino/ArduinoApps/EsparregsBCN/sketch/sketch.ino"
void setup() {
  matrix.begin();
}

void loop() {
  matrix.loadFrame(frame1);
  delay(500);
  matrix.loadFrame(frame2);
  delay(500);
}
