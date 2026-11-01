// Read only explicitly supplied process IDs. Requires macOS Command Line Tools.
#include <libproc.h>
#include <mach/mach_time.h>
#include <sys/resource.h>
#include <stdio.h>
#include <stdlib.h>
int main(int argc, char **argv) {
  mach_timebase_info_data_t timebase; mach_timebase_info(&timebase);
  printf("["); int emitted=0;
  for(int i=1;i<argc;i++) {
    int pid=atoi(argv[i]); if(pid<=0)continue;
    struct rusage_info_v4 r={0};
    if(proc_pid_rusage(pid,RUSAGE_INFO_V4,(rusage_info_t *)&r)!=0)continue;
    if(emitted++)printf(",");
    printf("{\"pid\":%d,\"rssBytes\":%llu,\"footprintBytes\":%llu,\"lifetimePeakFootprintBytes\":%llu,\"cpuSeconds\":%.9f}",pid,(unsigned long long)r.ri_resident_size,(unsigned long long)r.ri_phys_footprint,(unsigned long long)r.ri_lifetime_max_phys_footprint,((double)r.ri_user_time+(double)r.ri_system_time)*timebase.numer/timebase.denom/1e9);
  }
  printf("]\n"); return 0;
}
