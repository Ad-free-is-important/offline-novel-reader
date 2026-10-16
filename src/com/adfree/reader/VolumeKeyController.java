package com.adfree.reader;

/** Pure Java key routing; Android key codes: volume up=24, down=25. */
public final class VolumeKeyController {
    public static final int PASS=0,CONSUME=1,PREVIOUS=2,NEXT=3;
    private boolean enabled;
    private int held;
    private long lastTurn;
    public void setEnabled(boolean value) { enabled=value; }
    public void reset() { enabled=false;held=0;lastTurn=0; }
    public int event(int key,int action,int repeat,long time) {
        if(key!=24&&key!=25)return PASS;
        int mask=key==24?1:2;
        if(action==1) { if((held&mask)==0)return PASS;held&=~mask;return CONSUME; }
        if(action!=0)return (held&mask)!=0?CONSUME:PASS;
        if(repeat==0) {
            if(!enabled)return PASS;
            held|=mask;lastTurn=time;return key==24?PREVIOUS:NEXT;
        }
        // A key pressed outside the reader must retain its original system role.
        if((held&mask)==0)return PASS;
        if(!enabled||time-lastTurn<280)return CONSUME;
        lastTurn=time;return key==24?PREVIOUS:NEXT;
    }
}
