import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PortailCoreDataAccess } from './portail-core-data-access';

describe('PortailCoreDataAccess', () => {
  let component: PortailCoreDataAccess;
  let fixture: ComponentFixture<PortailCoreDataAccess>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PortailCoreDataAccess],
    }).compileComponents();

    fixture = TestBed.createComponent(PortailCoreDataAccess);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
