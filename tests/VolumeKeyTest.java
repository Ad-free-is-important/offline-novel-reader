import com.adfree.reader.VolumeKeyController;

public class VolumeKeyTest {
    private static int checks;
    private static void check(boolean yes,String label) { if(!yes)throw new AssertionError(label);checks++;System.out.println("PASS "+label); }
    public static void main(String[] args) {
        VolumeKeyController k=new VolumeKeyController();
        check(k.event(25,0,0,100)==k.PASS&&k.event(25,1,0,120)==k.PASS,"disabled volume keys pass through both actions");
        k.setEnabled(true);
        check(k.event(25,0,0,200)==k.NEXT&&k.event(25,1,0,250)==k.CONSUME,"volume down turns next once and consumes release");
        check(k.event(24,0,0,300)==k.PREVIOUS&&k.event(24,1,0,320)==k.CONSUME,"volume up turns previous once and consumes release");
        check(k.event(25,0,0,1000)==k.NEXT&&k.event(25,0,1,1100)==k.CONSUME,"short hold does not skip pages");
        check(k.event(25,0,2,1300)==k.NEXT&&k.event(25,0,3,1400)==k.CONSUME&&k.event(25,0,4,1600)==k.NEXT,"long hold repeats at a bounded rate");
        k.setEnabled(false);
        check(k.event(25,0,5,1900)==k.CONSUME&&k.event(25,1,0,2000)==k.CONSUME,"opening a sheet during a held key stops turns and consumes paired release");
        check(k.event(24,0,0,2100)==k.PASS,"disabled next press adjusts system volume");
        k.setEnabled(true);
        check(k.event(24,0,1,2400)==k.PASS&&k.event(24,1,0,2500)==k.PASS,"a key begun outside reading is not captured midway");
        check(k.event(4,0,0,2600)==k.PASS,"back and other keys pass through");
        k.event(25,0,0,2700);k.reset();
        check(k.event(25,0,1,3100)==k.PASS&&k.event(25,1,0,3200)==k.PASS,"background pause clears key state");
        k.setEnabled(true);k.event(24,0,0,3300);k.event(25,0,0,3301);
        check(k.event(24,1,0,3400)==k.CONSUME&&k.event(25,1,0,3401)==k.CONSUME,"simultaneously held volume keys each receive a matching release");
        System.out.println("TOTAL "+checks);
    }
}
